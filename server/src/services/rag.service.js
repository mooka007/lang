import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "node:fs/promises";
import path from "node:path";
import { env, requireModelConfig } from "../config/env.js";
import { answerFromContext, createEmbeddings, getTokenUsage, resetTokenUsage } from "./model.service.js";

let activeIndex = {
  vectorStore: null,
  chunks: [],
  documentName: null,
  chunkCount: 0,
  indexedAt: null
};

const branchTerms = [
  "france",
  "paris",
  "usa",
  "new york",
  "canada",
  "toronto",
  "nigeria",
  "lagos",
  "south africa",
  "cape town",
  "morocco",
  "casablanca",
  "russia",
  "moscow",
  "indonesia",
  "jakarta",
  "australia",
  "sydney"
];

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
  const normalizedQuestion = question.toLowerCase();
  const matchedBranchTerms = branchTerms.filter((term) => normalizedQuestion.includes(term));
  const terms = [
    ...(question.match(/\bCX-\d{3}\b/gi) || []),
    ...(question.match(/\bCX-[A-Z]{2}-\d{3}\b/gi) || []),
    ...(question.match(/\bPX-[a-z0-9-]+\b/gi) || []),
    ...(question.match(/\b[a-z0-9._%+-]+@companyx\.example\b/gi) || []),
    ...matchedBranchTerms
  ];

  if (matchedBranchTerms.length === 0 && /\b(branch|branches|country|countries|locations)\b/i.test(question)) {
    terms.push(...branchTerms);
  }

  return [...new Set(terms.map((term) => term.toLowerCase()))];
}

function findExactMatches(question, limit = 12) {
  const terms = extractExactTerms(question);
  if (terms.length === 0) {
    return [];
  }

  const seen = new Set();
  const matches = [];
  const perTermLimit = terms.length > 4 ? 1 : Math.max(2, Math.ceil(limit / terms.length));
  const wantsProjectDetails = /\b(project|projects|manager|managed|assigned|staffing|workstream|budget|deadline|kpi|risk)\b/i.test(question);

  function exactMatchScore(document, term) {
    const content = document.pageContent.toLowerCase();
    let score = 0;

    if (/^cx-(?:[a-z]{2}-)?\d{3}$/.test(term)) {
      if (content.includes(`${term} -`)) {
        score += 8;
      }
      if (content.includes("employee daily work briefs")) {
        score += 5;
      }
      if (content.includes("daily tasks")) {
        score += 4;
      }
      if (content.includes("employee directory")) {
        score -= 3;
      }
      if (content.includes("project staffing")) {
        score -= 2;
      }
    }

    if (branchTerms.includes(term) && wantsProjectDetails) {
      if (content.includes("branch project portfolio")) {
        score += 8;
      }
      if (content.includes("project staffing")) {
        score += 8;
      }
      if (content.includes("project manager")) {
        score += 4;
      }
      if (content.includes("branch project")) {
        score += 2;
      }
    }

    return score;
  }

  function addDocumentWithNeighbors(document, options = {}) {
    const beforeCount = options.beforeCount ?? 1;
    const afterCount = options.afterCount ?? 2;
    const candidates = [document];
    const chunkIndex = document.metadata.chunkIndex;

    if (Number.isInteger(chunkIndex)) {
      const neighbors = [];

      for (let offset = 1; offset <= beforeCount; offset += 1) {
        neighbors.push(activeIndex.chunks[chunkIndex - offset]);
      }

      for (let offset = 1; offset <= afterCount; offset += 1) {
        neighbors.push(activeIndex.chunks[chunkIndex + offset]);
      }

      for (const neighbor of neighbors) {
        if (neighbor?.metadata?.source === document.metadata.source) {
          candidates.push(neighbor);
        }
      }
    }

    let added = 0;
    for (const candidate of candidates) {
      const key = `${candidate.metadata.source}:${candidate.metadata.page}:${candidate.metadata.chunkIndex}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      matches.push(candidate);
      added += 1;

      if (matches.length >= limit) {
        break;
      }
    }

    return added;
  }

  for (const term of terms) {
    let termMatches = 0;
    const isEmployeeId = /^cx-(?:[a-z]{2}-)?\d{3}$/.test(term);
    const matchingDocuments = activeIndex.chunks
      .filter((document) => document.pageContent.toLowerCase().includes(term))
      .sort((left, right) => exactMatchScore(right, term) - exactMatchScore(left, term));

    for (const document of matchingDocuments) {
      termMatches += addDocumentWithNeighbors(document, {
        beforeCount: 1,
        afterCount: isEmployeeId ? 5 : 2
      });

      if (termMatches >= perTermLimit || matches.length >= limit) {
        break;
      }
    }

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
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

function isBranchOverviewQuestion(question) {
  return /\b(which|what|list|show)\s+(company\s+x\s+)?branches\b/i.test(question)
    || /\bbranches\s+(does|do)\s+company\s+x\s+(have|operate)\b/i.test(question)
    || /\bbranch\s+locations\b/i.test(question);
}

function findBranchOverviewMatches() {
  const seenSources = new Set();
  const matches = [];

  for (const document of activeIndex.chunks) {
    const source = String(document.metadata.source || "").toLowerCase();
    const page = pageFromMetadata(document.metadata);

    if (!source.includes("branch") || page !== 1 || seenSources.has(source)) {
      continue;
    }

    seenSources.add(source);
    matches.push(document);
  }

  return matches;
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
    indexedAt: activeIndex.indexedAt,
    tokenUsage: getTokenUsage()
  };
}

export async function indexFile(filePath, options = {}) {
  return indexFiles(
    [
      {
        filePath,
        displayName: options.displayName || path.basename(filePath)
      }
    ],
    options
  );
}

export async function indexFiles(files, options = {}) {
  requireModelConfig();
  resetTokenUsage();

  if (!files.length) {
    const error = new Error("No documents were found to index.");
    error.status = 400;
    throw error;
  }

  const loadedDocuments = [];

  for (const file of files) {
    const filePath = typeof file === "string" ? file : file.filePath;
    const displayName = typeof file === "string" ? path.basename(file) : file.displayName || path.basename(file.filePath);
    const documents = await loadFile(filePath, displayName);
    loadedDocuments.push(...normalizeDocuments(documents, displayName));
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 180
  });
  const chunks = await splitter.splitDocuments(loadedDocuments);
  chunks.forEach((chunk, index) => {
    chunk.metadata.chunkIndex = index;
  });
  const embeddings = createEmbeddings();
  const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

  activeIndex = {
    vectorStore,
    chunks,
    documentName: options.displayName || `${files.length} indexed documents`,
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
  const branchOverviewDocuments = isBranchOverviewQuestion(question) ? findBranchOverviewMatches() : [];
  const sourceLimit = branchOverviewDocuments.length ? 18 : 12;
  const sourceDocuments = isConversationHistoryQuestion(question)
    ? []
    : mergeDocuments(
        [...branchOverviewDocuments, ...findExactMatches(retrievalQuery)],
        await activeIndex.vectorStore.asRetriever(8).invoke(retrievalQuery),
        sourceLimit
      );
  const context = sourceDocuments
    .map((document, index) => {
      const page = pageFromMetadata(document.metadata);
      const label = page ? `${document.metadata.source}, page ${page}` : document.metadata.source;
      return `Source ${index + 1}: ${label}\n${document.pageContent}`;
    })
    .join("\n\n");

  const result = await answerFromContext({
    system:
      "You answer document questions using only the provided document context. You also receive recent conversation history. You may answer questions about the conversation history directly from that history. For document-content questions, if the answer is not in the document context, say you do not know from the document. Keep answers concise and practical.",
    question,
    context,
    history: formatHistory(history)
  });

  return {
    answer: result.answer,
    usage: result.usage,
    tokenUsage: getTokenUsage(),
    sources: sourceDocuments.map((document, index) => ({
      id: index + 1,
      source: document.metadata.source,
      page: pageFromMetadata(document.metadata),
      preview: document.pageContent.slice(0, 240)
    }))
  };
}
