const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("✅ DB OK"))
.catch(err => console.log("❌ DB ERROR:", err));

// ================= SCHEMA =================
const userSchema = new mongoose.Schema({
  userId: String,
  ip: String,
  lastTime: Number,
  count: Number,
  day: String
});

const codeSchema = new mongoose.Schema({
  code: String,
  userId: String,
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const pointSchema = new mongoose.Schema({
  userId: String,
  points: { type: Number, default: 0 }
});

const dailySchema = new mongoose.Schema({
  ip: String,
  lastClaim: Number,
  streak: Number
});

const User = mongoose.model("User", userSchema);
const Code = mongoose.model("Code", codeSchema);
const Point = mongoose.model("Point", pointSchema);
const Daily = mongoose.model("Daily", dailySchema);

// ================= VPN CHECK =================
async function isVPN(ip) {
  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
    return res.data.proxy || res.data.hosting;
  } catch {
    return false;
  }
}

// ================= REWARD =================
function getReward(streak){
  if(streak <= 4) return 1;
  if(streak <= 9) return 2;
  if(streak <= 14) return 3;
  if(streak <= 19) return 4;
  return 5;
}

// ================= GET CODE =================
app.get("/get-code", async (req, res) => {
  try {

    const ip = req.headers["cf-connecting-ip"] 
      || req.headers["x-forwarded-for"] 
      || req.socket.remoteAddress;

    if (await isVPN(ip)) {
      return res.json({ status: "vpn_blocked" });
    }

    const { userId, captcha } = req.query;

    if (!captcha) return res.json({ status: "captcha_fail" });

    const verify = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET,
        response: captcha
      })
    );

    if (!verify.data.success) {
      return res.json({ status: "captcha_fail" });
    }

    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({
        userId,
        ip,
        lastTime: 0,
        count: 0
      });
    }

    const now = Date.now();

    if (now - user.lastTime < 60000) {
      return res.json({ status: "cooldown" });
    }

    const today = new Date().toDateString();

    if (!user.day || user.day !== today) {
      user.day = today;
      user.count = 0;
    }

    if (user.count >= 3) {
      return res.json({ status: "limit" });
    }

    const code = "EP-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    await Code.create({ code, userId });

    user.lastTime = now;
    user.count += 1;
    user.ip = ip;

    await user.save();

    res.json({ status: "ok", code });

  } catch (err) {
    console.log(err);
    res.json({ status: "error" });
  }
});

// ================= CHECK CODE =================
app.post("/check-code", async (req, res) => {
  try {

    const { code, discordId } = req.body;

    const data = await Code.findOne({ code });

    if (!data || data.used) {
      return res.json({ status: "invalid" });
    }

    data.used = true;
    await data.save();

    let user = await Point.findOne({ userId: discordId });

    if (!user) user = new Point({ userId: discordId, points: 0 });

    user.points += 1;
    await user.save();

    res.json({ status: "ok", points: user.points });

  } catch {
    res.json({ status: "error" });
  }
});

// ================= POINT =================
app.get("/points/:id", async (req, res) => {
  const user = await Point.findOne({ userId: req.params.id });
  res.json({ points: user?.points || 0 });
});

// ================= REMOVE POINT =================
app.post("/remove-point", async (req, res) => {
  const { discordId, amount } = req.body;

  let user = await Point.findOne({ userId: discordId });
  if (!user) return res.json({ status: "error" });

  if (user.points < amount) {
    return res.json({ status: "not_enough" });
  }

  user.points -= amount;
  await user.save();

  res.json({ status: "ok", points: user.points });
});

// ================= DAILY =================
app.get("/daily", async (req, res) => {
  try {

    const ip = req.headers["cf-connecting-ip"] 
      || req.headers["x-forwarded-for"] 
      || req.socket.remoteAddress;

    if (await isVPN(ip)) {
      return res.json({ status: "vpn_blocked" });
    }

    const now = Date.now();

    let user = await Daily.findOne({ ip });

    if (!user) {
      user = new Daily({
        ip,
        lastClaim: 0,
        streak: 0
      });
    }

    if (now - user.lastClaim < 86400000) {
      return res.json({ status: "cooldown" });
    }

    if (now - user.lastClaim <= 172800000) {
      user.streak += 1;
    } else {
      user.streak = 1;
    }

    const reward = getReward(user.streak);

    user.lastClaim = now;
    await user.save();

    res.json({
      status: "ok",
      reward,
      streak: user.streak
    });

  } catch {
    res.json({ status: "error" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
