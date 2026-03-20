const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 👉 KẾT NỐI MONGODB
mongoose.connect("mongodb+srv://hoangquan7b_db_user:pQ80blkjvTiZhLky@cluster0.ey5zv2p.mongodb.net/tuytam");

// 👉 MODEL
const User = mongoose.model("User", {
  username: String,
  password: String,
  money: { type: Number, default: 0 },
  lastClaim: { type: Number, default: 0 }
});

// 👉 TEST
app.get("/", (req,res)=>{
  res.send("API đang chạy 🚀");
});

// 👉 REGISTER
app.post("/register", async (req,res)=>{
  let { username, password } = req.body;

  let exist = await User.findOne({ username });
  if(exist) return res.json({ msg:"exists" });

  let user = new User({ username, password });
  await user.save();

  res.json({ msg:"ok" });
});

// 👉 LOGIN
app.post("/login", async (req,res)=>{
  let { username, password } = req.body;

  let user = await User.findOne({ username });
  if(!user || user.password !== password){
    return res.json({ msg:"fail" });
  }

  res.json({
    msg:"ok",
    username:user.username,
    money:user.money
  });
});

// 👉 REWARD (1h/lần)
app.post("/reward", async (req,res)=>{
  let { username } = req.body;

  let user = await User.findOne({ username });
  if(!user) return res.json({ msg:"fail" });

  let now = Date.now();

  if(now - user.lastClaim < 3600000){
    return res.json({ msg:"wait" });
  }

  user.money += 500;
  user.lastClaim = now;

  await user.save();

  res.json({
    msg:"ok",
    money:user.money
  });
});

// 👉 START
app.listen(3000, ()=>{
  console.log("Server running...");
});
