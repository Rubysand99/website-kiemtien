const express = require("express");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const app = express();

// ================= CONFIG =================

app.set("trust proxy", true); // fix IP khi deploy Render
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

const User = mongoose.model("User", userSchema);

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

// ================= GET CODE =================

app.get("/get-code", async (req, res) => {

  try {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const { userId, token, fp, captcha } = req.query;

    console.log("IP:", ip);
    console.log("CAPTCHA:", captcha);
    console.log("SECRET:", process.env.TURNSTILE_SECRET);

    if (!captcha) {
      return res.json({ status: "captcha_fail" });
    }

    // ================= CAPTCHA VERIFY =================

    const verify = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET, // ✅ FIX ĐÚNG
        response: captcha
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    console.log("VERIFY RESULT:", verify.data);

    if (!verify.data.success) {
      return res.json({ status: "captcha_fail" });
    }

    // ================= USER =================

    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({
        userId,
        ip,
        token: Math.random().toString(36),
        fp,
        lastTime: 0,
        count: 0,
        day: new Date().toDateString()
      });
    }

    // ================= TOKEN CHECK =================

    if (token && token !== user.token) {
      return res.json({ status: "device_changed" });
    }

    // ================= DEVICE CHECK =================

    if (user.fp && user.fp !== fp) {
      return res.json({ status: "device_changed" });
    }

    // ================= COOLDOWN =================

    const now = Date.now();

    if (now - user.lastTime < 15000) {
      return res.json({ status: "cooldown" });
    }

    // ================= LIMIT / DAY =================

    const today = new Date().toDateString();

    if (user.day !== today) {
      user.day = today;
      user.count = 0;
    }

    if (user.count >= 5) {
      return res.json({ status: "limit" });
    }

    // ================= IP CHECK =================

    const ipUsers = await User.countDocuments({ ip });

    if (ipUsers > 5) {
      return res.json({ status: "multi_detect" });
    }

    // ================= GENERATE CODE =================

    const code = "RUBY-" + Math.floor(Math.random() * 1000000);

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
    console.log("❌ ERROR FULL:", err);
    console.log("❌ ERROR DATA:", err.response?.data);

    res.json({ status: "error" });
  }

});

// ================= START SERVER =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server chạy port", PORT);
});
