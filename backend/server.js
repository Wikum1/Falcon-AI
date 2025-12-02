// server.js
import express from "express";
import cors from "cors";          // still imported (used for safety if you want later)
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import fetch from "node-fetch";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "./models/User.js";

dotenv.config();

const app = express();

/* ------------------------
   CORS CONFIG
   ------------------------ */

// Origins we explicitly know about
const allowedOrigins = [
  "https://falconai1.netlify.app",                      // main Netlify site
  "http://localhost:5173",                             // Vite default
  "http://localhost:5174",                             // your current Vite port
  "https://falcon-ai--wikumsurindu542.replit.app",     // Replit URL
];

// Custom CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    const isExplicitAllowed = allowedOrigins.includes(origin);
    const isLocalhost = origin.startsWith("http://localhost");
    const isNetlify = origin.endsWith(".netlify.app");

    if (isExplicitAllowed || isLocalhost || isNetlify) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
    }
  }

  // Handle preflight quickly
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Body parser
app.use(express.json());

/* ------------------------
   HEALTH CHECK
   ------------------------ */
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

/* ------------------------
   DB CONNECT
   ------------------------ */
mongoose
  .connect(process.env.MONGO_URI, {
    dbName: "wikum_ai",
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err.message));

/* ------------------------
   AI CLIENTS
   ------------------------ */

// Groq
const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// DeepSeek (OpenAI compatible)
const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// HuggingFace uses plain fetch + HF_API_KEY

/* ------------------------
   AUTH MIDDLEWARE
   ------------------------ */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token is not valid" });
  }
};

/* ------------------------
   AUTH ROUTES
   ------------------------ */

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
    });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------
   WEATHER TOOL ROUTE
   ------------------------ */
app.post("/api/tools/weather", async (req, res) => {
  try {
    const { city } = req.body;

    if (!city || !city.trim()) {
      return res.status(400).json({ error: "City is required" });
    }

    if (!process.env.WEATHER_API_KEY) {
      return res
        .status(500)
        .json({ error: "WEATHER_API_KEY is not set in .env" });
    }

    const q = encodeURIComponent(city.trim());
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${q}&units=metric&appid=${process.env.WEATHER_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: data.message || "Weather API error" });
    }

    const result = {
      city: data.name,
      country: data.sys?.country,
      temp: data.main?.temp,
      feels_like: data.main?.feels_like,
      humidity: data.main?.humidity,
      description: data.weather?.[0]?.description,
      icon: data.weather?.[0]?.icon,
      raw: data, // optional: full raw response
    };

    res.json(result);
  } catch (err) {
    console.error("Weather API error:", err);
    res.status(500).json({ error: "Failed to fetch weather" });
  }
});

/* ------------------------
   CHAT ROUTE (protected)
   ------------------------ */
app.post("/api/chat", authMiddleware, async (req, res) => {
  try {
    const { message, messages, provider = "groq" } = req.body;

    if (!message && (!Array.isArray(messages) || messages.length === 0)) {
      return res
        .status(400)
        .json({ error: "Either `message` or `messages` is required" });
    }

    let chatMessages;
    if (Array.isArray(messages) && messages.length > 0) {
      chatMessages = messages;
    } else {
      chatMessages = [
        {
          role: "system",
          content:
            "You are a friendly AI assistant helping an IT undergraduate. Explain things simply with examples.",
        },
        { role: "user", content: message },
      ];
    }

    let aiReply = "";
    let usedProvider = provider;

    if (provider === "gemini") {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const combined = chatMessages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");
      const result = await model.generateContent(combined);
      aiReply = result.response.text();
    } else if (provider === "deepseek") {
      const response = await deepseekClient.chat.completions.create({
        model: "deepseek-chat",
        messages: chatMessages,
        max_tokens: 500,
        temperature: 0.7,
      });
      aiReply = response.choices[0]?.message?.content || "No reply";
    } else if (provider === "huggingface") {
      const userText =
        chatMessages.map((m) => `${m.role}: ${m.content}`).join("\n") ||
        message;

      const hfRes = await fetch(
        "https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: userText }),
        }
      );

      const data = await hfRes.json();
      aiReply = data[0]?.generated_text || JSON.stringify(data);
    } else {
      usedProvider = "groq";
      const response = await groqClient.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: chatMessages,
        max_tokens: 500,
        temperature: 0.7,
      });
      aiReply = response.choices[0]?.message?.content || "No reply";
    }

    res.json({ reply: aiReply, provider: usedProvider });
  } catch (err) {
    console.error("Chat API error:", err);
    const errorMsg =
      err?.response?.data?.error?.message ||
      err.message ||
      "Error contacting AI service";
    res.status(500).json({ error: errorMsg });
  }
});

/* ------------------------
   IMAGE GENERATION
   ------------------------ */
app.post("/api/image/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Call HuggingFace image model
    const hfRes = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error("HF image error:", errText);
      return res.status(500).json({ error: "Image API failed" });
    }

    // HF returns raw image bytes → convert to base64
    const arrayBuffer = await hfRes.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    return res.json({
      imageBase64: `data:image/png;base64,${base64Image}`,
    });
  } catch (err) {
    console.error("HF image error:", err);
    res.status(500).json({ error: "Image generation failed" });
  }
});

/* ------------------------
   START SERVER
   ------------------------ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
