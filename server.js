const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 👉 DÙNG MongoDB Atlas (free)
mongoose.connect("mongodb+srv://hoangquan7b_db_user:pQ80blkjvTiZhLky@cluster0.ey5zv2p.mongodb.net/tuytam");

// model
const User = mongoose.model("User", {
  username: { type:String, unique:true },
  password: String,
  money: { type:Number, default:0 },
  lastClaim: { type:Number, default:0 }
});

// REGISTER
app.post("/register", async (req,res)=>{
  const {username,password} = req.body;

  let exist = await User.findOne({username});
  if(exist) return res.json({msg:"exists"});

  await User.create({username,password});
  res.json({msg:"ok"});
});

// LOGIN
app.post("/login", async (req,res)=>{
  const user = await User.findOne(req.body);
  if(!user) return res.json({msg:"fail"});
  res.json(user);
});

// REWARD (ANTI SPAM)
app.post("/reward", async (req,res)=>{
  const {username} = req.body;

  let user = await User.findOne({username});
  if(!user) return res.json({msg:"fail"});

  let now = Date.now();

  // ⏳ 1 giờ
  if(now - user.lastClaim < 3600000){
    return res.json({
      msg:"wait",
      time: Math.ceil((3600000 - (now-user.lastClaim))/60000)
    });
  }

  // 💰 cộng tiền
  user.money += 500;
  user.lastClaim = now;

  await user.save();

  res.json({
    msg:"ok",
    money:user.money
  });
});

app.listen(process.env.PORT || 3000, ()=>{
  console.log("Server running...");
});
