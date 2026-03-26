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

// ================= SCHEMA =================

const userSchema = new mongoose.Schema({
  userId: String,
  ip: String,
  token: String,
  fp: String,
  lastTime: Number,
  count: Number,
  day: String
});

const codeSchema = new mongoose.Schema({
  code: String,
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
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

// ================= GEN CODE =================

function genCode(){
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
    const { userId, token, fp, captcha } = req.query;

    if (!captcha) {
      return res.json({ status: "captcha_fail" });
    }

    // ===== CAPTCHA VERIFY =====
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

    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({
        userId,
        ip,
        token: Math.random().toString(36),
        fp,
        lastTime: 0,
        count: 0
      });
    }

    // ===== DEVICE CHECK (FIX NHẸ) =====
    if (token && user.token && token !== user.token) {
      return res.json({ status: "device_changed" });
    }

    // ===== COOLDOWN =====
    const now = Date.now();

    if (now - user.lastTime < 15000) {
      return res.json({ status: "cooldown" });
    }

    // ===== LIMIT =====
    const today = new Date().toDateString();

    if (!user.day || user.day !== today) {
      user.day = today;
      user.count = 0;
    }

    if (user.count >= 5) {
      return res.json({ status: "limit" });
    }

    // ===== GENERATE CODE =====
    const code = genCode();

    await Code.create({ code });

    user.lastTime = now;
    user.count += 1;
    user.ip = ip;
    user.fp = fp;

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
    console.log(err);
    res.json({ status: "error" });
  }
});

// ================= CHECK CODE =================

app.post("/check-code", async (req, res) => {
  try {
    const { code, discordId } = req.body;

    const found = await Code.findOne({ code });

    if (!found) {
      return res.json({ status: "invalid" });
    }

    // hết hạn 60s
    if (Date.now() - new Date(found.createdAt).getTime() > 60000) {
      return res.json({ status: "expired" });
    }

    if (found.used) {
      return res.json({ status: "expired" });
    }

    found.used = true;
    await found.save();

    let user = await User.findOne({ userId: discordId });

    if (!user) {
      user = new User({
        userId: discordId,
        count: 0
      });
    }

    user.count = (user.count || 0) + 1;
    await user.save();

    res.json({
      status: "ok",
      points: user.count
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
