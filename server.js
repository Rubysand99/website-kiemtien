const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect("YOUR_MONGODB_URL");

const User = mongoose.model("User",{
username:String,
password:String,
money:{type:Number,default:0},
daily:{
type:Object,
default:{}
}
});

// register
app.post("/register",async(req,res)=>{
let u = await User.findOne({username:req.body.username});
if(u) return res.json({msg:"exist"});

await User.create(req.body);
res.json({msg:"ok"});
});

// login
app.post("/login",async(req,res)=>{
let u = await User.findOne(req.body);
if(!u) return res.json({msg:"fail"});
res.json({msg:"ok"});
});

// get user
app.get("/user/:name",async(req,res)=>{
let u = await User.findOne({username:req.params.name});
res.json(u);
});

// reward
app.post("/reward",async(req,res)=>{
let {username,link_id} = req.body;

let user = await User.findOne({username});
if(!user) return res.json({msg:"fail"});

let today = new Date().toDateString();

if(!user.daily[link_id]){
user.daily[link_id] = {date:today,count:0};
}

// reset ngày
if(user.daily[link_id].date !== today){
user.daily[link_id] = {date:today,count:0};
}

// check limit 3 lần
if(user.daily[link_id].count >= 3){
return res.json({msg:"limit"});
}

// cộng point
user.money += 1;
user.daily[link_id].count += 1;

await user.save();

res.json({msg:"ok",money:user.money});

});

app.listen(10000,()=>console.log("Server chạy"));
