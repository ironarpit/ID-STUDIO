import express from "express";
import path from "path";
import dotenv from "dotenv";
import compression from "compression";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(compression());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Cache control headers for API responses
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    backend: "cloudflare-d1",
    workerUrl: "https://bsm-iq-api.ironarpit.workers.dev"
  });
});

// Gemini AI Invoice & Product Scanner endpoint
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

app.post("/api/gemini/scan-invoice", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", prompt } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: "Missing imageBase64 data." });
    }

    const ai = getAIClient();
    if (!ai) {
      return res.status(500).json({
        success: false,
        message: "Gemini API key is not configured on the server."
      });
    }

    const systemInstruction = `You are a high-speed retail inventory scanning system.
Analyze the image of an invoice, receipt, shelf price tag, or product packaging.
Extract all visible products with accurate fields:
- name: string (Product description/title)
- barcode: string (EAN / Barcode if visible, or empty)
- localCode: string (Bansal/Local item code if visible, or empty)
- mrp: number
- costPrice: number
- salePrice: number
- category: string
- unit: string (e.g. PCS, KG, PACK)

Return ONLY valid JSON in this exact structure:
{
  "products": [
    {
      "name": "...",
      "barcode": "...",
      "localCode": "...",
      "mrp": 0,
      "costPrice": 0,
      "salePrice": 0,
      "category": "...",
      "unit": "PCS"
    }
  ]
}`;

    const defaultPrompt = prompt || "Extract all product and price information from this retail invoice/photo.";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: `${systemInstruction}\n\nTask: ${defaultPrompt}` },
            {
              inlineData: {
                data: imageBase64,
                mimeType
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { products: [] };
    }

    const products = Array.isArray(parsed.products) ? parsed.products : [];
    res.json({
      success: true,
      products
    });
  } catch (err: any) {
    console.error("Gemini scan error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to analyze image with AI."
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
