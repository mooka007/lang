import express from "express";
import multer from "multer";
import path from "node:path";
import { env } from "../config/env.js";
import { askQuestion, getIndexStatus, indexFile } from "../services/rag.service.js";

const supportedExtensions = new Set([".pdf", ".txt", ".md"]);

const storage = multer.diskStorage({
  destination: env.uploadsDir,
  filename(_request, file, callback) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
    callback(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: env.uploadMaxFileSizeMb * 1024 * 1024
  },
  fileFilter(_request, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!supportedExtensions.has(extension)) {
      callback(new Error("Only PDF, TXT, and Markdown files are supported."));
      return;
    }
    callback(null, true);
  }
});

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((message) => message && ["user", "assistant"].includes(message.role))
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, 1200)
    }))
    .filter((message) => message.content.trim());
}

export const documentsRouter = express.Router();

documentsRouter.get("/status", (_request, response) => {
  response.json(getIndexStatus());
});

documentsRouter.post("/index-sample", async (_request, response, next) => {
  try {
    const status = await indexFile(env.samplePdfPath, {
      displayName: "Company X Employee Knowledge Base"
    });

    response.json(status);
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/upload", upload.single("file"), async (request, response, next) => {
  try {
    if (!request.file) {
      const error = new Error("Upload a PDF, TXT, or Markdown file.");
      error.status = 400;
      throw error;
    }

    const status = await indexFile(request.file.path, {
      displayName: request.file.originalname
    });

    response.json(status);
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/chat", async (request, response, next) => {
  try {
    const question = String(request.body?.question || "").trim();
    if (!question) {
      const error = new Error("Question is required.");
      error.status = 400;
      throw error;
    }

    const result = await askQuestion(question, sanitizeHistory(request.body?.history));
    response.json(result);
  } catch (error) {
    next(error);
  }
});
