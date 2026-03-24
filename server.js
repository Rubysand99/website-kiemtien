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
  try{

    const {code, discordId} = req.body;

    let data = await Code.findOne({code});

    if(!data) return res.json({status:"invalid"});
    if(data.used) return res.json({status:"used"});

    // ⏱️ kiểm tra hết hạn (15 phút)
    let now = Date.now();
    let created = new Date(data.createdAt).getTime();

    if(now - created > 15 * 60 * 1000){
      return res.json({status:"expired"});
    }

    // đánh dấu đã dùng
    data.used = true;
    await data.save();

    // cộng point
    let user = await User.findOne({discordId});

    if(!user){
      user = await User.create({discordId, points:0});
    }

    user.points += 1; // ✅ mỗi code = 1 point
    await user.save();

    res.json({
      status: "ok",
      points: user.points
    });

  }catch(err){
    console.log(err);
    res.json({status:"error"});
  }
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
