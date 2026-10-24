import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { transcribeHandwriting, formatTranscriptionText, transcribeAudio, transcribeMultimodal, translateText, summarizeDocument } from "./src/lib/gemini";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload size limit to allow high-resolution multi-page scans (up to 20 pages)
  app.use(express.json({ limit: "150mb" }));
  app.use(express.urlencoded({ limit: "150mb", extended: true }));

  function formatApiErrorMessage(err: any, fallback: string): string {
    if (!err) return fallback;
    if (typeof err === "string") return err;
    if (err.message) {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed?.error?.message) {
          if (parsed.error.code === 503 || parsed.error.status === "UNAVAILABLE") {
            return "Les serveurs d'IA sont temporairement très sollicités. Veuillez relancer l'analyse dans quelques secondes.";
          }
          return parsed.error.message;
        }
      } catch (_) {}
      if (err.message.includes("503") || err.message.toLowerCase().includes("high demand") || err.message.toLowerCase().includes("unavailable")) {
        return "Les serveurs d'IA sont temporairement très sollicités. Veuillez relancer l'analyse dans quelques secondes.";
      }
      if (err.message.toLowerCase().includes("timeout") || err.message.toLowerCase().includes("timed out")) {
        return "Le traitement du document a pris plus de temps que prévu par l'IA. Veuillez relancer l'analyse.";
      }
      return err.message;
    }
    return fallback;
  }

  // API Route for Handwrited Script OCR Transcription via Gemini
  app.post("/api/transcribe", async (req, res) => {
    const { base64Images, mimeType, language, rawScan, audioBase64, audioMimeType } = req.body;
    
    // If audio is also provided along with images, route seamlessly to multimodal transcription
    if (audioBase64 && base64Images && Array.isArray(base64Images) && base64Images.length > 0) {
      try {
        const result = await transcribeMultimodal(
          base64Images,
          audioBase64,
          audioMimeType || "audio/webm",
          mimeType || "image/jpeg",
          language || "French"
        );
        return res.json(result);
      } catch (err: any) {
        console.error("Gemini Multimodal Route Error:", err);
        return res.status(500).json({ error: formatApiErrorMessage(err, "Échec de l'analyse multimodale par l'IA.") });
      }
    }

    if (!base64Images || (Array.isArray(base64Images) && base64Images.length === 0)) {
      return res.status(400).json({ error: "Aucune image n'a été fournie pour la transcription." });
    }

    try {
      const result = await transcribeHandwriting(base64Images, mimeType || "image/jpeg", language || "French", !!rawScan);
      res.json(result);
    } catch (err: any) {
      console.error("Gemini Transcription Route Error:", err);
      res.status(500).json({ error: formatApiErrorMessage(err, "Échec de l'analyse OCR par l'IA. Veuillez réessayer.") });
    }
  });

  // API Route for Simultaneous Multimodal Transcription (Manuscript Photos + Audio Dictation)
  app.post("/api/transcribe-multimodal", async (req, res) => {
    const { base64Images, audioBase64, audioMimeType, mimeType, language } = req.body;

    if (!base64Images || (Array.isArray(base64Images) && base64Images.length === 0)) {
      return res.status(400).json({ error: "Aucune image de manuscrit n'a été fournie." });
    }
    if (!audioBase64) {
      return res.status(400).json({ error: "Aucun fichier audio n'a été fourni." });
    }

    try {
      const result = await transcribeMultimodal(
        base64Images,
        audioBase64,
        audioMimeType || "audio/webm",
        mimeType || "image/jpeg",
        language || "French"
      );
      res.json(result);
    } catch (err: any) {
      console.error("Gemini Multimodal Transcription Route Error:", err);
      res.status(500).json({ error: formatApiErrorMessage(err, "Échec de la transcription multimodale par l'IA.") });
    }
  });

  // API Route for High-Quality Audio / Voice Transcription via Gemini 3.8 Flash
  app.post("/api/transcribe-audio", async (req, res) => {
    const { audioBase64, mimeType, language, promptMode } = req.body;
    
    if (!audioBase64) {
      return res.status(400).json({ error: "Aucun enregistrement audio n'a été fourni." });
    }

    try {
      const result = await transcribeAudio(audioBase64, mimeType || "audio/webm", language || "French", promptMode || "formatted");
      res.json(result);
    } catch (err: any) {
      console.error("Gemini Audio Transcription Route Error:", err);
      res.status(500).json({ error: formatApiErrorMessage(err, "Échec de la transcription vocale. Veuillez réessayer.") });
    }
  });

  // API Route for Handwrited Script Text Formatting (Formatting and structure styling)
  app.post("/api/format", async (req, res) => {
    const { text, style, language } = req.body;
    
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Aucun texte fourni pour la mise en forme brute." });
    }

    try {
      const formattedText = await formatTranscriptionText(text, style || "standard", language || "French");
      res.json({ formattedText });
    } catch (err: any) {
      console.error("Gemini Formatting Route Error:", err);
      res.status(500).json({ error: formatApiErrorMessage(err, "Échec de la mise en forme de texte par l'IA. Veuillez réessayer.") });
    }
  });

  // API Route for Instant Multi-language Translation via Gemini
  app.post("/api/translate", async (req, res) => {
    const { text, targetLanguage } = req.body;
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Aucun texte fourni pour la traduction." });
    }
    try {
      const translatedText = await translateText(text, targetLanguage || "French");
      res.json({ translatedText });
    } catch (err: any) {
      console.error("Gemini Translation Route Error:", err);
      res.status(500).json({ error: formatApiErrorMessage(err, "Échec de la traduction par l'IA. Veuillez réessayer.") });
    }
  });

  // API Route for Executive Summary & Key Takeaways via Gemini
  app.post("/api/summarize", async (req, res) => {
    const { text, language } = req.body;
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Aucun texte fourni pour la synthèse." });
    }
    try {
      const summaryData = await summarizeDocument(text, language || "French");
      res.json(summaryData);
    } catch (err: any) {
      console.error("Gemini Summarization Route Error:", err);
      res.status(500).json({ error: formatApiErrorMessage(err, "Échec de la synthèse par l'IA. Veuillez réessayer.") });
    }
  });

  // PWA & Android TWA integration routes
  app.get("/.well-known/assetlinks.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.sendFile(path.join(process.cwd(), "public", ".well-known", "assetlinks.json"));
  });

  app.get("/manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.sendFile(path.join(process.cwd(), "public", "manifest.json"));
  });

  app.get("/twa-manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.sendFile(path.join(process.cwd(), "public", "twa-manifest.json"));
  });

  app.get("/sw.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(process.cwd(), "public", "sw.js"));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  // Set generous timeouts for high-resolution AI processing and audio transcription
  server.timeout = 300000; // 5 minutes
  server.keepAliveTimeout = 65000;
}

startServer();
