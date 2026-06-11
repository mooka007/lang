import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

const indexFilePath = path.join(env.dataDir, "rag-index.json");
const conversationsFilePath = path.join(env.dataDir, "conversations.json");
let postgresPersistence = null;

async function getPostgresPersistence() {
  if (!postgresPersistence) {
    postgresPersistence = await import("./postgres-persistence.service.js");
  }

  return postgresPersistence;
}

function shouldUsePostgres() {
  return env.storageProvider === "postgres";
}

async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

export function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export async function loadIndexSnapshot() {
  if (shouldUsePostgres()) {
    return (await getPostgresPersistence()).loadIndexSnapshot();
  }

  return readJson(indexFilePath, {
    version: 1,
    documentName: null,
    indexedAt: null,
    documents: [],
    chunks: []
  });
}

export async function saveIndexSnapshot(snapshot) {
  if (shouldUsePostgres()) {
    await (await getPostgresPersistence()).saveIndexSnapshot(snapshot);
    return;
  }

  await writeJson(indexFilePath, {
    version: 1,
    documentName: snapshot.documentName || null,
    indexedAt: snapshot.indexedAt || null,
    documents: snapshot.documents || [],
    chunks: snapshot.chunks || []
  });
}

export async function searchVectorChunks(queryEmbedding, limit = 8) {
  if (shouldUsePostgres()) {
    return (await getPostgresPersistence()).searchVectorChunks(queryEmbedding, limit);
  }

  return null;
}

async function loadConversationStore() {
  return readJson(conversationsFilePath, {
    version: 1,
    conversations: []
  });
}

async function saveConversationStore(store) {
  await writeJson(conversationsFilePath, {
    version: 1,
    conversations: store.conversations || []
  });
}

export async function listConversations() {
  if (shouldUsePostgres()) {
    return (await getPostgresPersistence()).listConversations();
  }

  const store = await loadConversationStore();
  return [...store.conversations]
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages?.length || 0
    }));
}

export async function getConversation(conversationId) {
  if (shouldUsePostgres()) {
    return (await getPostgresPersistence()).getConversation(conversationId);
  }

  const store = await loadConversationStore();
  return store.conversations.find((conversation) => conversation.id === conversationId) || null;
}

export async function appendConversationTurn({ conversationId, question, answer, sources, usage }) {
  if (shouldUsePostgres()) {
    return (await getPostgresPersistence()).appendConversationTurn({
      conversationId,
      question,
      answer,
      sources,
      usage
    });
  }

  const store = await loadConversationStore();
  const now = new Date().toISOString();
  let conversation = conversationId
    ? store.conversations.find((item) => item.id === conversationId)
    : null;

  if (!conversation) {
    conversation = {
      id: createId("conv"),
      title: question.slice(0, 80),
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    store.conversations.push(conversation);
  }

  conversation.updatedAt = now;
  conversation.messages.push({
    role: "user",
    content: question,
    createdAt: now
  });
  conversation.messages.push({
    role: "assistant",
    content: answer,
    sources: sources || [],
    usage: usage || null,
    createdAt: now
  });

  await saveConversationStore(store);
  return conversation;
}

export async function deleteConversation(conversationId) {
  if (shouldUsePostgres()) {
    return (await getPostgresPersistence()).deleteConversation(conversationId);
  }

  const store = await loadConversationStore();
  const beforeCount = store.conversations.length;
  store.conversations = store.conversations.filter((conversation) => conversation.id !== conversationId);
  await saveConversationStore(store);
  return beforeCount !== store.conversations.length;
}
