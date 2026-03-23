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
const User = mongoose.model("User", {
  username: String,
  password: String,
  points: { type: Number, default: 0 },
  links: { type: Object, default: {} } // lưu số lần vượt link mỗi ngày
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

app.get("/", (req, res) => {
  res.send("Server đang chạy OK 🚀");
});

// ====== VERIFY (NHẬN POINT) ======
app.post("/verify", async (req,res)=>{
  const {username, link_id} = req.body;

  let user = await User.findOne({username});
  if(!user) return res.send("User không tồn tại");

  let today = new Date().toDateString();

  if(!user.links[link_id]){
    user.links[link_id] = { date: today, count: 0 };
  }

  // reset nếu qua ngày mới
  if(user.links[link_id].date !== today){
    user.links[link_id] = { date: today, count: 0 };
  }

  // giới hạn 3 lần/ngày
  if(user.links[link_id].count >= 3){
    return res.send("Hôm nay bạn đã vượt link này đủ 3 lần");
  }

  user.links[link_id].count += 1;
  user.points += 10;

  await user.save();

  res.send("+10 point");
});

// ====== LẤY THÔNG TIN USER ======
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
