const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();
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
  day: String,
  points: { type: Number, default: 0 } // 🔥 FIX
});

const codeSchema = new mongoose.Schema({
  code: String,
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Code = mongoose.model("Code", codeSchema);

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

    if (!userId || !captcha) {
      return res.json({ status: "error" });
    }

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

    if (now - user.lastTime < 60000) {
      return res.json({ status: "cooldown" });
    }

    const today = new Date().toDateString();

    if (!user.day || user.day !== today) {
      user.day = today;
      user.count = 0;
    }

    if (user.count >= 3) {
      return res.json({ status: "limit" });
    }

    const code = "EP-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    await Code.create({ code });

    user.lastTime = now;
    user.count += 1;
    user.ip = ip;

    await user.save();

    res.json({ status: "ok", code });

  } catch (err) {
    console.log("❌ ERROR:", err.message);
    res.json({ status: "error" });
  }
});

// ================= CHECK CODE (FIX LƯU POINT) =================

app.post("/check-code", async (req, res) => {
  try {
    const { code, discordId } = req.body;

    const data = await Code.findOne({ code });

    if (!data) return res.json({ status: "invalid" });
    if (data.used) return res.json({ status: "invalid" });

    const now = Date.now();
    const created = new Date(data.createdAt).getTime();

    if (now - created > 15 * 60 * 1000) {
      return res.json({ status: "expired" });
    }

    data.used = true;
    await data.save();

    // 🔥 LƯU POINT
    let user = await User.findOne({ userId: discordId });

    if (!user) {
      user = new User({
        userId: discordId,
        points: 0
      });
    }

    user.points += 1;
    await user.save();

    res.json({
      status: "ok",
      points: user.points
    });

  } catch (err) {
    console.log("❌ CHECK ERROR:", err.message);
    res.json({ status: "error" });
  }
});

// ================= GET POINT =================

app.get("/points/:id", async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.id });
    res.json({ points: user?.points || 0 });
  } catch {
    res.json({ points: 0 });
  }
});

// ================= LEADERBOARD =================

app.get("/leaderboard", async (req, res) => {
  try {
    const users = await User.find({ points: { $gt: 0 } })
      .sort({ points: -1 })
      .limit(20);

    res.json(users);
  } catch {
    res.json([]);
  }
});

app.post("/remove-point", async (req, res) => {
  try {
    const { discordId, amount } = req.body;

    let user = await User.findOne({ userId: discordId });

    if (!user) return res.json({ status: "error" });

    if (amount) {
      user.points = Math.max(0, user.points - amount);
    } else {
      user.points = 0;
    }

    await user.save();

    res.json({ status: "ok" });

  } catch {
    res.json({ status: "error" });
  }
});

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
