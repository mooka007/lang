import express from "express";
import fs from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  askQuestion,
  deleteIndexedDocument,
  getIndexStatus,
  indexFile,
  indexFiles,
  listIndexedDocuments
} from "../services/rag.service.js";
import {
  appendConversationTurn,
  deleteConversation,
  getConversation,
  listConversations
} from "../services/persistence.service.js";

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
documentsRouter.use(requireAuth);

async function getCompanySampleFiles() {
  const files = await fs.readdir(env.samplePdfDir);
  return files
    .filter((file) => file.startsWith("company-x-") && file.endsWith(".pdf"))
    .sort((left, right) => {
      if (left === "company-x-employee-knowledge-base.pdf") {
        return -1;
      }
      if (right === "company-x-employee-knowledge-base.pdf") {
        return 1;
      }
      return left.localeCompare(right);
    })
    .map((file) => ({
      filePath: path.join(env.samplePdfDir, file),
      displayName: file.replace(/\.pdf$/i, "").replace(/-/g, " ")
    }));
}

documentsRouter.get("/status", (request, response) => {
  response.json(getIndexStatus(request.user));
});

documentsRouter.get("/documents", (request, response) => {
  response.json({
    documents: listIndexedDocuments(request.user)
  });
});

documentsRouter.delete("/documents/:documentId", async (request, response, next) => {
  try {
    const deleted = await deleteIndexedDocument(request.params.documentId, request.user);
    if (!deleted) {
      const error = new Error("Document not found.");
      error.status = 404;
      throw error;
    }

    response.json(getIndexStatus(request.user));
  } catch (error) {
    next(error);
  }
});

documentsRouter.get("/conversations", async (request, response, next) => {
  try {
    response.json({
      conversations: await listConversations(request.user.id)
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.get("/conversations/:conversationId", async (request, response, next) => {
  try {
    const conversation = await getConversation(request.params.conversationId, request.user.id);
    if (!conversation) {
      const error = new Error("Conversation not found.");
      error.status = 404;
      throw error;
    }

    response.json({
      conversation
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.delete("/conversations/:conversationId", async (request, response, next) => {
  try {
    const deleted = await deleteConversation(request.params.conversationId, request.user.id);
    if (!deleted) {
      const error = new Error("Conversation not found.");
      error.status = 404;
      throw error;
    }

    response.json({
      conversations: await listConversations(request.user.id)
    });
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/index-sample", async (request, response, next) => {
  try {
    const sampleFiles = await getCompanySampleFiles();
    await indexFiles(sampleFiles, {
      displayName: `Company X Knowledge Base (${sampleFiles.length} PDFs)`,
      mode: "replace",
      sourceType: "sample",
      ownerId: request.user.id,
      accessLevel: "private"
    });

    response.json(getIndexStatus(request.user));
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

    await indexFile(request.file.path, {
      displayName: request.file.originalname,
      mode: "append",
      sourceType: "upload",
      ownerId: request.user.id,
      accessLevel: String(request.body?.accessLevel || "private")
    });

    response.json(getIndexStatus(request.user));
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

    const conversationId = String(request.body?.conversationId || "").trim();
    const storedConversation = conversationId ? await getConversation(conversationId, request.user.id) : null;
    const requestHistory = sanitizeHistory(request.body?.history);
    const history = requestHistory.length ? requestHistory : sanitizeHistory(storedConversation?.messages);
    const result = await askQuestion(question, history, request.user);
    const conversation = await appendConversationTurn({
      conversationId: conversationId || null,
      ownerId: request.user.id,
      question,
      answer: result.answer,
      sources: result.sources,
      usage: result.usage
    });

    response.json({
      ...result,
      conversationId: conversation.id,
      conversation
    });
  } catch (error) {
    next(error);
  }
});
