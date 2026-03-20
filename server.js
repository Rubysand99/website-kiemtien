const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ❗ CONNECT MONGODB (KHÔNG CRASH)
mongoose.connect("mongodb+srv://hoangquan7b_db_user:pQ80blkjvTiZhLky@cluster0.ey5zv2p.mongodb.net/tuytam")
.then(()=>console.log("✅ DB connected"))
.catch(err=>{
  console.log("❌ DB lỗi:", err);
});

// MODEL
const User = mongoose.model("User", {
  username: String,
  password: String,
  money: { type: Number, default: 0 },
  lastClaim: { type: Number, default: 0 }
});

// TEST
app.get("/", (req,res)=>{
  res.send("API OK");
});

// REGISTER
app.post("/register", async (req,res)=>{
  try{
    let { username, password } = req.body;

    let exist = await User.findOne({ username });
    if(exist) return res.json({ msg:"exists" });

    let user = new User({ username, password });
    await user.save();

    res.json({ msg:"ok" });
  }catch(e){
    res.json({ msg:"error" });
  }
});

// LOGIN
app.post("/login", async (req,res)=>{
  try{
    let { username, password } = req.body;

    let user = await User.findOne({ username });

    if(!user || user.password !== password){
      return res.json({ msg:"fail" });
    }

    res.json({ msg:"ok", username:user.username });
  }catch(e){
    res.json({ msg:"error" });
  }
});

// REWARD
app.post("/reward", async (req,res)=>{
  try{
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

    res.json({ msg:"ok", money:user.money });

  }catch(e){
    res.json({ msg:"error" });
  }
});

// ❗ QUAN TRỌNG NHẤT
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log("🚀 Server chạy port", PORT);
});
