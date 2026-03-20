const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 👉 thay link MongoDB của bạn
mongoose.connect("mongodb://127.0.0.1:27017/tuytam");

// model user
const User = mongoose.model("User", {
  username: String,
  password: String,
  money: { type: Number, default: 0 },
  lastClaim: { type: Number, default: 0 }
});

// đăng ký
app.post("/register", async (req,res)=>{
  const {username,password} = req.body;

  let exist = await User.findOne({username});
  if(exist) return res.json({msg:"exists"});

  await User.create({username,password});
  res.json({msg:"ok"});
});

// đăng nhập
app.post("/login", async (req,res)=>{
  const user = await User.findOne(req.body);
  if(!user) return res.json({msg:"fail"});
  res.json(user);
});

// reward (1h/lần)
app.post("/reward", async (req,res)=>{
  const {username} = req.body;

  let user = await User.findOne({username});
  if(!user) return res.json({msg:"fail"});

  let now = Date.now();

  if(now - user.lastClaim < 3600000){
    return res.json({msg:"wait"});
  }

  user.money += 500;
  user.lastClaim = now;

  await user.save();

  res.json({msg:"ok", money:user.money});
});

app.listen(3000, ()=>console.log("Server chạy tại 3000"));
