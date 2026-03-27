const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

// ===== DATABASE =====
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("✅ DB OK"))
.catch(err => console.log("❌ DB ERROR:", err));

// ===== SCHEMA =====
const userSchema = new mongoose.Schema({
  userId: String,
  ip: String,
  lastTime: {
    funklink: Number,
    linkvertise: Number
  },
  count: {
    funklink: Number,
    linkvertise: Number
  },
  day: String
});

const codeSchema = new mongoose.Schema({
  code: String,
  userId: String,
  used: { type: Boolean, default: false }
});

const User = mongoose.model("User", userSchema);
const Code = mongoose.model("Code", codeSchema);

// ===== VPN CHECK =====
async function isVPN(ip) {
  try {
    const r = await axios.get(`http://ip-api.com/json/${ip}?fields=proxy,hosting`);
    return r.data.proxy || r.data.hosting;
  } catch {
    return false;
  }
}

// ===== GET CODE =====
app.get("/get-code", async (req, res) => {
  try {
    const ip = req.ip;
    const { userId, captcha, type } = req.query;

    if (!captcha) return res.json({ status: "captcha_fail" });
    if (!["funklink", "linkvertise"].includes(type)) {
      return res.json({ status: "invalid_type" });
    }

    if (await isVPN(ip)) {
      return res.json({ status: "vpn_blocked" });
    }

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
        lastTime: { funklink: 0, linkvertise: 0 },
        count: { funklink: 0, linkvertise: 0 },
        day: ""
      });
    }

    const now = Date.now();
    const today = new Date().toDateString();

    if (!user.day || user.day !== today) {
      user.day = today;
      user.count = { funklink: 0, linkvertise: 0 };
    }

    if (now - (user.lastTime[type] || 0) < 60000) {
      return res.json({ status: "cooldown" });
    }

    if ((user.count[type] || 0) >= 3) {
      return res.json({ status: "limit" });
    }

    const code = "EP-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    await Code.create({ code, userId });

    user.lastTime[type] = now;
    user.count[type] += 1;
    user.ip = ip;

    await user.save();

    const reward = type === "funklink" ? 2 : 1;

    res.json({
      status: "ok",
      code,
      reward
    });

  } catch (err) {
    console.log(err);
    res.json({ status: "error" });
  }
});

// ===== CHECK CODE =====
app.post("/check-code", async (req, res) => {
  try {
    const { code } = req.body;

    const data = await Code.findOne({ code });

    if (!data) return res.json({ status: "invalid" });
    if (data.used) return res.json({ status: "used" });

    data.used = true;
    await data.save();

    res.json({ status: "ok" });

  } catch {
    res.json({ status: "error" });
  }
});

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
