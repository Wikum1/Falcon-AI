import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const router = express.Router();

// ---------- GEMINI ----------
router.post("/gemini", async (req, res) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(req.body.prompt);
    res.json({ text: result.response.text() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- DEEPSEEK ----------
router.post("/deepseek", async (req, res) => {
  try {
    const client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: req.body.prompt }],
    });

    res.json({ text: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- HUGGINGFACE ----------
router.post("/huggingface", async (req, res) => {
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: req.body.prompt }),
      }
    );

    const data = await response.json();
    res.json({ text: data[0]?.generated_text || JSON.stringify(data) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
