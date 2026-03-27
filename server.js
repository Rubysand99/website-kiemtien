const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const app = express();

app.use(cors());
app.use(express.json());

// ================= FIX PROXY =================
app.set("trust proxy", 1);

// ================= RATE LIMIT =================
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30
});
app.use(limiter);

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
  day: String,
  points: { type: Number, default: 0 }
});

const codeSchema = new mongoose.Schema({
  code: String,
  userId: String,
  used: { type: Boolean, default: false },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 900 // ✅ 15 phút
  }
});

const User = mongoose.model("User", userSchema);
const Code = mongoose.model("Code", codeSchema);

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("Server OK 🚀");
});

// ================= GET CODE =================
app.get("/get-code", async (req, res) => {
  try {
    const ip = req.ip;
    const { userId, fp, captcha } = req.query;

    if (!captcha) return res.json({ status: "captcha_fail" });

    // ===== CAPTCHA =====
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
        count: 0,
        points: 0
      });
    }

    const now = Date.now();

    // ===== COOLDOWN =====
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

    // ===== CREATE CODE =====
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
      code,
      expiresIn: 900 // ✅ 15 phút
    });

  } catch (err) {
    console.log("ERROR:", err.response?.data || err);
    res.json({ status: "error" });
  }
});

// ================= CHECK CODE =================
app.post("/check-code", async (req, res) => {
  try {
    const { code, discordId } = req.body;

    const data = await Code.findOne({ code });

    if (!data) {
      return res.json({ status: "invalid" });
    }

    if (data.used) {
      return res.json({ status: "used" });
    }

    // ===== CHECK EXPIRED (backup) =====
    const now = Date.now();
    const created = new Date(data.createdAt).getTime();

    if (now - created > 15 * 60 * 1000) {
      return res.json({ status: "expired" });
    }

    // ===== USER =====
    let user = await User.findOne({ userId: discordId });

    if (!user) {
      user = new User({
        userId: discordId,
        points: 0
      });
    }

    // ===== ADD POINT =====
    user.points += 1;

    data.used = true;

    await user.save();
    await data.save();

    res.json({
      status: "ok",
      points: user.points
    });

  } catch (err) {
    console.log(err);
    res.json({ status: "error" });
  }
});

// ================= GET POINT =================
app.get("/points/:id", async (req, res) => {
  const user = await User.findOne({ userId: req.params.id });
  res.json({ points: user?.points || 0 });
});

app.get("/leaderboard", async (req, res) => {
  const users = await User.find().sort({ points: -1 }).limit(10);
  res.json(users);
});

// ================= ADD POINT =================
app.post("/add-point", async (req, res) => {
  const { discordId, amount } = req.body;

  let user = await User.findOne({ userId: discordId });

  if (!user) {
    user = new User({ userId: discordId, points: 0 });
  }

  user.points += amount;

  await user.save();

  res.json({ success: true, points: user.points });
});

// ================= REMOVE POINT =================
app.post("/remove-point", async (req, res) => {
  const { discordId, amount } = req.body;

  let user = await User.findOne({ userId: discordId });

  if (!user) {
    return res.json({ success: false });
  }

  if (amount == null) {
    user.points = 0;
  } else {
    user.points = Math.max(0, user.points - amount);
  }

  await user.save();

  res.json({ success: true, points: user.points });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
