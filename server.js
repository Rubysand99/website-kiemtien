const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();

// 🔥 FIX TRUST PROXY (bắt buộc trên Render)
app.set("trust proxy", 1);

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

const User = mongoose.model("User", userSchema);
const Code = mongoose.model("Code", codeSchema);

// ================= ROOT =================

app.get("/", (req, res) => {
  res.send("Server OK 🚀");
});

// ================= CHECK VPN =================

async function isVPN(ip) {
  try {
    const r = await axios.get(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
    return r.data.proxy || r.data.hosting;
  } catch {
    return false;
  }
}

// ================= GET CODE =================

app.get("/get-code", async (req, res) => {
  try {
    const ip = req.ip;

    const { userId, captcha } = req.query;

    if (!captcha) return res.json({ status: "captcha_fail" });

    // 🔒 CHẶN VPN
    const vpn = await isVPN(ip);
    if (vpn) {
      return res.json({ status: "vpn_blocked" });
    }

    // ===== CAPTCHA =====
    const verify = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET,
        response: captcha,
        remoteip: ip
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
        count: 0,
        day: ""
      });
    }

    const now = Date.now();

    // ⏱ COOLDOWN 60s
    if (now - user.lastTime < 60000) {
      return res.json({ status: "cooldown" });
    }

    // 📅 RESET THEO NGÀY
    const today = new Date().toDateString();

    if (!user.day || user.day !== today) {
      user.day = today;
      user.count = 0;
    }

    // 🔒 GIỚI HẠN 3 LẦN
    if (user.count >= 3) {
      return res.json({ status: "limit" });
    }

    // 🎁 TẠO CODE
    const code = "EP-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    await Code.create({
      code,
      userId
    });

    user.lastTime = now;
    user.count += 1;
    user.ip = ip;

    await user.save();

    res.json({
      status: "ok",
      code
    });

  } catch (err) {
    console.log("ERROR:", err);
    res.json({ status: "error" });
  }
});

// ================= CHECK CODE =================

app.post("/check-code", async (req, res) => {
  try {
    const { code } = req.body;

    const data = await Code.findOne({ code });

    if (!data) {
      return res.json({ status: "invalid" });
    }

    if (data.used) {
      return res.json({ status: "used" });
    }

    data.used = true;
    await data.save();

    res.json({
      status: "ok",
      points: 1
    });

  } catch (err) {
    console.log(err);
    res.json({ status: "error" });
  }
});

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
