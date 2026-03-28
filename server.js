const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();

// 🔥 FIX PROXY (QUAN TRỌNG)
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
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Code = mongoose.model("Code", codeSchema);

// ================= ROOT =================

app.get("/", (req, res) => {
  res.send("Server OK 🚀");
});

// ================= VPN CHECK =================

async function isVPN(ip) {
  try {
    const res = await axios.get(`https://ipapi.co/${ip}/json/`);
    return res.data.proxy || res.data.vpn || res.data.tor;
  } catch {
    return false;
  }
}

// ================= GET CODE =================

app.get("/get-code", async (req, res) => {
  try {
    const ip = req.ip;
    const { userId, captcha } = req.query;

    console.log("IP:", ip);

    if (!userId || !captcha) {
      return res.json({ status: "error" });
    }

    // ===== CAPTCHA =====
    const verify = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET,
        response: captcha
      })
    );

    console.log("VERIFY:", verify.data);

    if (!verify.data.success) {
      return res.json({ status: "captcha_fail" });
    }

    // ===== VPN BLOCK =====
    if (await isVPN(ip)) {
      return res.json({ status: "vpn_blocked" });
    }

    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({
        userId,
        ip,
        lastTime: 0,
        count: 0
      });
    }

    const now = Date.now();

    // ===== COOLDOWN (60s) =====
    if (now - user.lastTime < 60000) {
      return res.json({ status: "cooldown" });
    }

    // ===== LIMIT (3 lần/ngày) =====
    const today = new Date().toDateString();

    if (!user.day || user.day !== today) {
      user.day = today;
      user.count = 0;
    }

    if (user.count >= 3) {
      return res.json({ status: "limit" });
    }

    // ===== CREATE CODE =====
    const code = "EP-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    await Code.create({ code });

    user.lastTime = now;
    user.count += 1;
    user.ip = ip;

    await user.save();

    res.json({
      status: "ok",
      code
    });

  } catch (err) {
    console.log("❌ ERROR FULL:", err.response?.data || err.message);
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
      return res.json({ status: "invalid" });
    }

    // ===== EXPIRE 15 PHÚT =====
    const now = Date.now();
    const created = new Date(data.createdAt).getTime();

    if (now - created > 15 * 60 * 1000) {
      return res.json({ status: "expired" });
    }

    data.used = true;
    await data.save();

    res.json({
      status: "ok",
      points: 1
    });

  } catch (err) {
    console.log("❌ CHECK ERROR:", err.message);
    res.json({ status: "error" });
  }
});

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
