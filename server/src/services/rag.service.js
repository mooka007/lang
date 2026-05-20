import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "node:fs/promises";
import path from "node:path";
import { env, requireModelConfig } from "../config/env.js";
import { answerFromContext, createEmbeddings } from "./model.service.js";

let activeIndex = {
  vectorStore: null,
  chunks: [],
  documentName: null,
  chunkCount: 0,
  indexedAt: null
};

function pageFromMetadata(metadata) {
  return metadata?.loc?.pageNumber || metadata?.pdf?.pageNumber || metadata?.page || null;
}

async function loadFile(filePath, displayName) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    const loader = new PDFLoader(filePath, {
      splitPages: true
    });
    return loader.load();
  }

  if (extension === ".txt" || extension === ".md") {
    const content = await fs.readFile(filePath, "utf8");
    return [
      new Document({
        pageContent: content,
        metadata: {
          source: displayName
        }
      })
    ];
  }

  const error = new Error("Unsupported document type.");
  error.status = 400;
  throw error;
}

function normalizeDocuments(documents, displayName) {
  return documents.map((document, index) => {
    const page = pageFromMetadata(document.metadata);

    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        source: displayName,
        page: page || index + 1
      }
    });
  });
}

function extractExactTerms(question) {
  const terms = [
    ...(question.match(/\bCX-\d{3}\b/gi) || []),
    ...(question.match(/\bPX-[a-z0-9-]+\b/gi) || []),
    ...(question.match(/\b[a-z0-9._%+-]+@companyx\.example\b/gi) || [])
  ];

  return [...new Set(terms.map((term) => term.toLowerCase()))];
}

function findExactMatches(question, limit = 12) {
  const terms = extractExactTerms(question);
  if (terms.length === 0) {
    return [];
  }

  return activeIndex.chunks
    .filter((document) => {
      const content = document.pageContent.toLowerCase();
      return terms.some((term) => content.includes(term));
    })
    .slice(0, limit);
}

function mergeDocuments(primaryDocuments, secondaryDocuments, limit = 12) {
  const seen = new Set();
  const merged = [];

  for (const document of [...primaryDocuments, ...secondaryDocuments]) {
    const key = `${document.metadata.source}:${document.metadata.page}:${document.pageContent.slice(0, 80)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(document);

    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}

function isConversationHistoryQuestion(question) {
  return /\b(last|previous|earlier|before)\s+(question|questions|ask|asked)\b/i.test(question)
    || /\bwhat\s+did\s+i\s+ask\b/i.test(question)
    || /\bwhat\s+were\s+my\s+questions\b/i.test(question);
}

function formatHistory(history) {
  if (!history.length) {
    return "No previous messages were provided.";
  }

  return history
    .map((message, index) => `${index + 1}. ${message.role}: ${message.content}`)
    .join("\n");
}

function buildRetrievalQuery(question, history) {
  const recentUserQuestions = history
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content);

  return [...recentUserQuestions, question].join("\n");
}

export function getIndexStatus() {
  return {
    ready: Boolean(activeIndex.vectorStore),
    documentName: activeIndex.documentName,
    chunkCount: activeIndex.chunkCount,
    indexedAt: activeIndex.indexedAt
  };
}

export async function indexFile(filePath, options = {}) {
  requireModelConfig();

  const displayName = options.displayName || path.basename(filePath);
  const documents = normalizeDocuments(await loadFile(filePath, displayName), displayName);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 180
  });
  const chunks = await splitter.splitDocuments(documents);
  const embeddings = createEmbeddings();
  const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

  activeIndex = {
    vectorStore,
    chunks,
    documentName: displayName,
    chunkCount: chunks.length,
    indexedAt: new Date().toISOString()
  };

  return getIndexStatus();
}

export async function askQuestion(question, history = []) {
  requireModelConfig();

  if (!activeIndex.vectorStore) {
    const error = new Error("No document is indexed yet. Index the sample PDF or upload a document first.");
    error.status = 400;
    throw error;
  }

  const retrievalQuery = buildRetrievalQuery(question, history);
  const sourceDocuments = isConversationHistoryQuestion(question)
    ? []
    : mergeDocuments(
        findExactMatches(retrievalQuery),
        await activeIndex.vectorStore.asRetriever(8).invoke(retrievalQuery)
      );
  const context = sourceDocuments
    .map((document, index) => {
      const page = pageFromMetadata(document.metadata);
      const label = page ? `${document.metadata.source}, page ${page}` : document.metadata.source;
      return `Source ${index + 1}: ${label}\n${document.pageContent}`;
    })
    .join("\n\n");

  const answer = await answerFromContext({
    system:
      "You answer document questions using only the provided document context. You also receive recent conversation history. You may answer questions about the conversation history directly from that history. For document-content questions, if the answer is not in the document context, say you do not know from the document. Keep answers concise and practical.",
    question,
    context,
    history: formatHistory(history)
  });

  return {
    answer,
    sources: sourceDocuments.map((document, index) => ({
      id: index + 1,
      source: document.metadata.source,
      page: pageFromMetadata(document.metadata),
      preview: document.pageContent.slice(0, 240)
    }))
  };
}
