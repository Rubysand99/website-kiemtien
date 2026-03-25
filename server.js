const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());
app.use(cors());
app.set("trust proxy", true);

// ===== RATE LIMIT =====
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { status: "spam" }
});

app.use("/get-code", limiter);
app.use("/check-code", limiter);

// ===== CONNECT DB =====
mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log("✅ DB OK"))
.catch(err=>console.log("❌ DB lỗi:", err));

// ===== MODEL =====
const User = mongoose.model("User", {
  discordId: String,
  token: String,
  points: { type: Number, default: 0 },
  daily: {
    date: String,
    count: Number
  },
  ip: String,
  fingerprint: String,
  lastGet: Number
});

const Code = mongoose.model("Code", {
  code: String,
  used: { type: Boolean, default: false },
  usedBy: String,
  expireAt: Number
});

// ===== UTILS =====
function genToken(){
  return Math.random().toString(36).substring(2) + Date.now();
}

async function verifyCaptcha(token){
  try{
    const res = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET,
        response: token
      })
    );
    return res.data.success;
  }catch{
    return false;
  }
}

// ===== GET CODE =====
app.get("/get-code", async (req,res)=>{
  const { userId, token, fp, captcha } = req.query;

  if(!userId) return res.json({ status: "error" });

  // CAPTCHA
  if(!(await verifyCaptcha(captcha))){
    return res.json({ status: "captcha_fail" });
  }

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // CHECK VPN
  try{
    const check = await axios.get(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
    if(check.data.proxy || check.data.hosting){
      return res.json({ status: "vpn_block" });
    }
  }catch{}

  let user = await User.findOne({ discordId: userId });

  if(!user){
    user = await User.create({
      discordId: userId,
      token: genToken(),
      daily: { date: "", count: 0 }
    });
  }

  // TOKEN CHECK
  if(user.token && token && user.token !== token){
    return res.json({ status: "device_changed" });
  }

  if(!user.token){
    user.token = genToken();
  }

  let today = new Date().toDateString();

  if(user.daily.date !== today){
    user.daily = { date: today, count: 0 };
  }

  // MULTI ACCOUNT CHECK
  let sameIP = await User.countDocuments({
    ip,
    "daily.date": today
  });

  if(sameIP > 5){
    return res.json({ status: "multi_detect" });
  }

  // DEVICE CHECK
  let sameDevice = await User.countDocuments({
    fingerprint: fp,
    "daily.date": today
  });

  if(sameDevice > 3){
    return res.json({ status: "device_limit" });
  }

  // LIMIT 5 CODE
  if(user.daily.count >= 5){
    return res.json({ status: "limit" });
  }

  // COOLDOWN
  if(user.lastGet && Date.now() - user.lastGet < 15000){
    return res.json({ status: "cooldown" });
  }

  // RANDOM DELAY
  await new Promise(r => setTimeout(r, 1000 + Math.random()*2000));

  // CREATE CODE
  const code = "EP-" + Math.random().toString(36).substring(2,8).toUpperCase();

  await Code.create({
    code,
    expireAt: Date.now() + 15 * 60 * 1000
  });

  user.daily.count += 1;
  user.lastGet = Date.now();
  user.ip = ip;
  user.fingerprint = fp;

  await user.save();

  res.json({
    status: "ok",
    code,
    token: user.token
  });
});

// ===== CHECK CODE =====
app.post("/check-code", async (req,res)=>{
  const { code, discordId } = req.body;

  let c = await Code.findOne({ code });

  if(!c) return res.json({ status: "invalid" });
  if(c.used) return res.json({ status: "used" });
  if(Date.now() > c.expireAt)
    return res.json({ status: "expired" });

  let user = await User.findOne({ discordId });

  if(!user){
    user = await User.create({
      discordId,
      points: 0
    });
  }

  c.used = true;
  c.usedBy = discordId;

  user.points += 1;

  await c.save();
  await user.save();

  res.json({
    status: "ok",
    points: user.points
  });
});

// ===== INFO =====
app.get("/user/:id", async (req,res)=>{
  let user = await User.findOne({ discordId: req.params.id });

  if(!user) return res.json({ points: 0 });

  res.json({ points: user.points });
});

// ===== TEST =====
app.get("/", (req,res)=>{
  res.send("🚀 Server chạy OK");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>{
  console.log("🚀 Server chạy port", PORT);
});
