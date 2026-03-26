const express = require("express");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("✅ DB OK"))
.catch(err => console.log("❌ DB ERROR:", err));

// USER schema
const userSchema = new mongoose.Schema({
  userId: String,
  ip: String,
  token: String,
  lastTime: Number,
  count: Number,
  day: String
});

const User = mongoose.model("User", userSchema);

// CODE schema
const codeSchema = new mongoose.Schema({
  code: String,
  used: Boolean,
  createdAt: Number
});

const Code = mongoose.model("Code", codeSchema);

// ================= RATE LIMIT =================

const limiter = rateLimit({
  windowMs: 15 * 1000,
  max: 5
});

app.use("/get-code", limiter);

// ================= ROOT =================

app.get("/", (req, res) => {
  res.send("Server đang chạy OK 🚀");
});

// ================= RANDOM CODE =================

function generateCode(){
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "EP-";

  for(let i = 0; i < 6; i++){
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

// ================= GET CODE =================

app.get("/get-code", async (req, res) => {

  try {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const { userId, token, captcha } = req.query;

    if (!captcha) {
      return res.json({ status: "captcha_fail" });
    }

    // CAPTCHA VERIFY
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

    // USER
    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({
        userId,
        ip,
        token: Math.random().toString(36),
        lastTime: 0,
        count: 0,
        day: new Date().toDateString()
      });
    }

    // TOKEN CHECK (giữ nhẹ)
    if (token && user.token && token !== user.token) {
      return res.json({ status: "device_changed" });
    }

    const now = Date.now();

    // COOLDOWN
    if (now - user.lastTime < 15000) {
      return res.json({ status: "cooldown" });
    }

    // LIMIT NGÀY
    const today = new Date().toDateString();

    if (!user.day || user.day !== today) {
      user.day = today;
      user.count = 0;
    }

    if (user.count >= 5) {
      return res.json({ status: "limit" });
    }

    // IP CHECK
    const ipUsers = await User.countDocuments({ ip });

    if (ipUsers > 5) {
      return res.json({ status: "multi_detect" });
    }

    // GENERATE CODE
    const code = generateCode();

    await Code.create({
      code: code,
      used: false,
      createdAt: Date.now()
    });

    user.lastTime = now;
    user.count += 1;
    user.ip = ip;

    if (!user.token) {
      user.token = Math.random().toString(36);
    }

    await user.save();

    res.json({
      status: "ok",
      code: code,
      token: user.token
    });

  } catch (err) {
    console.log("❌ SERVER ERROR:", err);
    res.json({ status: "error" });
  }

});

// ================= VERIFY CODE =================

app.get("/verify-code", async (req, res) => {
  try {
    const { code } = req.query;

    const regex = /^EP-[A-Z0-9]{6}$/;

    if (!regex.test(code)) {
      return res.json({ status: "invalid" });
    }

    const found = await Code.findOne({ code });

    if (!found) {
      return res.json({ status: "invalid" });
    }

    if (found.used) {
      return res.json({ status: "used" });
    }

    found.used = true;
    await found.save();

    res.json({ status: "ok" });

  } catch (err) {
    console.log("VERIFY ERROR:", err);
    res.json({ status: "error" });
  }
});

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
