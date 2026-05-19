import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Gemini Proxy Route
  app.post("/api/chat", async (req, res) => {
    try {
      const { prompt, systemInstruction, history } = req.body;
      
      const chat = model.startChat({
        generationConfig: {
          responseMimeType: "application/json",
        },
        history: history || [],
      });

      // We explicitly ask for JSON in the prompt even if response_mime_type is set for better compliance
      const result = await model.generateContent({
          contents: [
              { role: 'user', parts: [{ text: `${systemInstruction}\n\nUser Message: ${prompt}` }] }
          ],
          generationConfig: {
              responseMimeType: "application/json"
          }
      });
      
      const response = await result.response;
      const text = response.text();
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Nav Bridge Mock Python Integration
  app.post("/api/route", (req, res) => {
    const { from, to } = req.body;
    // Mock BFS/A* response
    res.json({
      path: [from, "Corridor A", "Central Hub", "Corridor B", to],
      distance: "45 meters",
      estimatedTime: "1.5 mins",
      status: "Calculated via A*"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
