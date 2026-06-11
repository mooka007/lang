import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const rootDir = path.resolve(currentDir, "..", "..", "..");
const serverDir = path.join(rootDir, "server");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(serverDir, ".env") });

function parseOrigins(value) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeProvider(value, fallback = "openai") {
  return String(value || fallback).trim().toLowerCase();
}

function normalizeOpenAIModel(value, fallback) {
  const model = String(value || fallback).trim();
  return model.startsWith("openai/") ? model.replace("openai/", "") : model;
}

function normalizeGitHubModel(value, fallback) {
  const model = String(value || fallback).trim();
  return model.includes("/") ? model : `openai/${model}`;
}

function normalizeStorageProvider(value) {
  const provider = String(value || "json").trim().toLowerCase();
  return provider === "postgres" ? "postgres" : "json";
}

function optionalNumber(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const llmProvider = normalizeProvider(process.env.LLM_PROVIDER, "openai");
const embeddingProvider = normalizeProvider(process.env.EMBEDDING_PROVIDER, llmProvider);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || process.env.CLIENT_URL || "http://localhost:3000"),
  rootDir,
  serverDir,
  dataDir: path.join(serverDir, "data"),
  uploadsDir: path.join(serverDir, "uploads"),
  uploadMaxFileSizeMb: optionalNumber(process.env.UPLOAD_MAX_MB, 100),
  samplePdfDir: path.join(serverDir, "pdfs"),
  samplePdfPath: path.join(serverDir, "pdfs", "company-x-employee-knowledge-base.pdf"),
  storageProvider: normalizeStorageProvider(process.env.STORAGE_PROVIDER),
  databaseUrl: process.env.DATABASE_URL || "",
  llmProvider,
  embeddingProvider,
  embeddingBatchSize: optionalNumber(process.env.EMBEDDING_BATCH_SIZE, 32),
  llmTemperature: optionalNumber(process.env.LLM_TEMPERATURE, 0.1),
  llmMaxTokens: optionalNumber(process.env.LLM_MAX_TOKENS, 900),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    chatModel: normalizeOpenAIModel(process.env.OPENAI_CHAT_MODEL || process.env.LLM_MODEL, "gpt-4.1-mini"),
    embeddingModel: normalizeOpenAIModel(process.env.OPENAI_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL, "text-embedding-3-small")
  },
  github: {
    token: process.env.GITHUB_TOKEN || "",
    baseUrl: (process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference").replace(/\/$/, ""),
    apiVersion: process.env.GITHUB_MODELS_API_VERSION || "2026-03-10",
    chatModel: normalizeGitHubModel(process.env.LLM_MODEL || process.env.OPENAI_CHAT_MODEL, "openai/gpt-4.1-mini"),
    embeddingModel: normalizeGitHubModel(process.env.EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL, "openai/text-embedding-3-small"),
    embeddingDimensions: optionalNumber(process.env.EMBEDDING_DIMENSIONS, undefined)
  }
};

export function requireModelConfig() {
  if (env.llmProvider === "openai" && !env.openai.apiKey) {
    const error = new Error("OPENAI_API_KEY is missing. Add it to .env before indexing or asking questions.");
    error.status = 400;
    throw error;
  }

  if ((env.llmProvider === "github" || env.embeddingProvider === "github") && !env.github.token) {
    const error = new Error("GITHUB_TOKEN is missing. Add a GitHub token with models:read access to .env.");
    error.status = 400;
    throw error;
  }
}
