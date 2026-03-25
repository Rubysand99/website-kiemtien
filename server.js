const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ===== CONNECT MONGODB =====
mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log("✅ DB OK"))
.catch(err=>console.log("❌ DB lỗi:", err));

// ===== MODEL =====
const Code = mongoose.model("Code", {
  code: String,
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", {
  discordId: String,
  points: { type: Number, default: 0 }
});

// ===== ROOT =====
app.get("/", (req,res)=>{
  res.send("🚀 Server đang chạy OK");
});

// ===== TẠO CODE =====
app.post("/verify", async (req,res)=>{
  try{

    // tạo code random
    let code = "EP-" + Math.random().toString(36).substring(2,8).toUpperCase();

    await Code.create({ code });

    res.send(code);

  }catch(err){
    console.log(err);
    res.send("❌ Lỗi server");
  }
});

// ===== CHECK CODE =====
app.post("/check-code", async (req,res)=>{
  const { code, discordId } = req.body;

  const Code = mongoose.model("Code");
  const User = mongoose.model("User");

  let c = await Code.findOne({ code });
  if(!c) return res.json({ status: "invalid" });

  if(c.used) return res.json({ status: "used" });

  if(Date.now() > c.expireAt)
    return res.json({ status: "expired" });

  // ===== USER =====
  let user = await User.findOne({ discordId });
  if(!user){
    user = await User.create({
      discordId,
      points: 0,
      daily: { date: "", count: 0 },
      lastClaim: 0
    });
  }

  let today = new Date().toDateString();

  // reset ngày
  if(user.daily.date !== today){
    user.daily = { date: today, count: 0 };
  }

  // ❌ GIỚI HẠN 5 CODE / NGÀY
  if(user.daily.count >= 5){
    return res.json({ status: "limit" });
  }

  // ❌ COOLDOWN 30 GIÂY
  if(Date.now() - user.lastClaim < 30000){
    return res.json({ status: "cooldown" });
  }

  // ===== NHẬN THƯỞNG =====
  c.used = true;
  c.usedBy = discordId;

  user.points += 1;
  user.daily.count += 1;
  user.lastClaim = Date.now();

  await c.save();
  await user.save();

  res.json({
    status: "ok",
    points: user.points
  });
});

// ===== LEADERBOARD =====
app.get("/leaderboard", async (req,res)=>{
  try{
    let top = await User.find().sort({points:-1}).limit(10);
    res.json(top);
  }catch(err){
    res.json([]);
  }
});

// ===== SERVER =====
const PORT = process.env.PORT || 10000;

app.listen(PORT, ()=>{
  console.log("🚀 Server chạy port", PORT);
});
