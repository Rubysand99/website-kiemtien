const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ====== CONNECT MONGODB ======
mongoose.connect("mongodb+srv://rubynek209:197155680el@cluster0.ey5zv2p.mongodb.net/earnpoint?retryWrites=true&w=majority")
.then(()=>console.log("✅ DB OK"))
.catch(err=>console.log("❌ DB lỗi:", err));

// ====== MODEL ======
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  points: { type: Number, default: 0 },
  links: { type: Map, of: Object, default: {} }
});

const User = mongoose.model("User", userSchema);

// ====== ROOT ======
app.get("/", (req, res) => {
  res.send("Server đang chạy OK 🚀");
});

// ====== REGISTER ======
app.post("/register", async (req,res)=>{
  const {username,password} = req.body;

  let user = await User.findOne({username});
  if(user) return res.send("User đã tồn tại");

  await User.create({username,password});
  res.send("Đăng ký thành công");
});

// ====== LOGIN ======
app.post("/login", async (req,res)=>{
  const {username,password} = req.body;

  let user = await User.findOne({username,password});
  if(!user) return res.send("Sai tài khoản");

  res.json({
    message: "OK",
    user: username,
    points: user.points
  });
});

// ====== VERIFY ======
app.post("/verify", async (req,res)=>{
  const {username, link_id} = req.body;

  let user = await User.findOne({username});
  if(!user) return res.send("User không tồn tại");

  let today = new Date().toDateString();

  if(!user.links.get(link_id)){
    user.links.set(link_id, { date: today, count: 0 });
  }

  let data = user.links.get(link_id);

  if(data.date !== today){
    data = { date: today, count: 0 };
  }

  if(data.count >= 3){
    return res.send("Hôm nay bạn đã vượt link này đủ 3 lần");
  }

  data.count += 1;
  user.points += 10;

  user.links.set(link_id, data);
  user.markModified("links");

  await user.save();

  res.send("+10 point");
});

// ====== GET USER ======
app.get("/user/:username", async (req,res)=>{
  let user = await User.findOne({username: req.params.username});
  if(!user) return res.send("Không tồn tại");

  res.json(user);
});

// ====== SERVER ======
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>{
  console.log("🚀 Server chạy port", PORT);
});
