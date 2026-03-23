const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ====== CONNECT DB ======
mongoose.connect("mongodb+srv://rubynek209:197155680el@cluster0.ey5zv2p.mongodb.net/earnpoint?retryWrites=true&w=majority")
.then(()=>console.log("✅ DB OK"))
.catch(err=>console.log("❌ DB lỗi:", err));

// ====== MODEL ======
const Code = mongoose.model("Code", {
  code: String,
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// ====== ROOT ======
app.get("/", (req,res)=>{
  res.send("Server OK 🚀");
});

// ====== VERIFY → TẠO CODE ======
app.post("/verify", async (req,res)=>{
  try{

    // random code
    let code = "EP-" + Math.random().toString(36).substring(2,8).toUpperCase();

    await Code.create({ code });

    res.send(code);

  }catch(err){
    console.log(err);
    res.send("Lỗi server");
  }
});

// ====== CHECK CODE (CHO BOT) ======
app.post("/check-code", async (req,res)=>{
  const {code} = req.body;

  let data = await Code.findOne({code});

  if(!data) return res.json({status:"invalid"});
  if(data.used) return res.json({status:"used"});

  data.used = true;
  await data.save();

  res.json({status:"ok"});
});

// ====== SERVER ======
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>{
  console.log("🚀 Server chạy port", PORT);
});
