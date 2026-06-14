import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "node:fs/promises";
import path from "node:path";
import { env, requireModelConfig } from "../config/env.js";
import { answerFromContext, createEmbeddings, getTokenUsage, resetTokenUsage } from "./model.service.js";
import { createId, loadIndexSnapshot, saveIndexSnapshot, searchVectorChunks } from "./persistence.service.js";
import { canUseTeam } from "./team.service.js";

let activeIndex = {
  documents: [],
  chunks: [],
  vectorRecords: [],
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

function documentFromRecord(record) {
  return new Document({
    pageContent: record.text,
    metadata: record.metadata || {}
  });
}

function hydrateIndex(snapshot) {
  const records = snapshot.chunks || [];

  activeIndex = {
    documents: snapshot.documents || [],
    chunks: records.map(documentFromRecord),
    vectorRecords: records.map((record) => ({
      ...record,
      document: documentFromRecord(record)
    })),
    documentName: snapshot.documentName || null,
    chunkCount: records.length,
    indexedAt: snapshot.indexedAt || null
  };
}

function createSnapshot() {
  return {
    documentName: activeIndex.documentName,
    indexedAt: activeIndex.indexedAt,
    documents: activeIndex.documents,
    chunks: activeIndex.vectorRecords.map((record) => ({
      id: record.id,
      documentId: record.documentId,
      text: record.text,
      metadata: record.metadata,
      teamId: record.teamId,
      embedding: record.embedding
    }))
  };
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator ? dot / denominator : 0;
}

function summarizeDocumentName(documents) {
  if (!documents.length) {
    return null;
  }

  if (documents.length === 1) {
    return documents[0].displayName;
  }

  return `${documents.length} indexed documents`;
}

function canAccessDocument(document, user) {
  if (!user) {
    return false;
  }

  return user.role === "admin"
    || document.ownerId === user.id
    || document.accessLevel === "public"
    || (document.accessLevel === "team" && document.teamId && user.teamIds?.includes(document.teamId));
}

function canManageDocument(document, user) {
  return Boolean(user) && (user.role === "admin" || document.ownerId === user.id);
}

function accessibleDocuments(user) {
  return activeIndex.documents.filter((document) => canAccessDocument(document, user));
}

function accessibleDocumentIds(user) {
  return new Set(accessibleDocuments(user).map((document) => document.id));
}

function documentNameForUser(user) {
  return summarizeDocumentName(accessibleDocuments(user));
}

async function persistActiveIndex() {
  await saveIndexSnapshot(createSnapshot());
}

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

function normalizeDocuments(documents, displayName, documentId, ownerId, accessLevel, teamId) {
  return documents.map((document, index) => {
    const page = pageFromMetadata(document.metadata);

    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        documentId,
        ownerId,
        accessLevel,
        teamId,
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

function findExactMatches(question, user, limit = 12) {
  const terms = extractExactTerms(question);
  if (terms.length === 0) {
    return [];
  }

  const allowedDocumentIds = accessibleDocumentIds(user);
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
        if (neighbor?.metadata?.source === document.metadata.source && allowedDocumentIds.has(neighbor.metadata.documentId)) {
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
      .filter((document) => allowedDocumentIds.has(document.metadata.documentId) && document.pageContent.toLowerCase().includes(term))
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

function findBranchOverviewMatches(user) {
  const seenSources = new Set();
  const matches = [];
  const allowedDocumentIds = accessibleDocumentIds(user);

  for (const document of activeIndex.chunks) {
    const source = String(document.metadata.source || "").toLowerCase();
    const page = pageFromMetadata(document.metadata);

    if (!allowedDocumentIds.has(document.metadata.documentId) || !source.includes("branch") || page !== 1 || seenSources.has(source)) {
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

export async function loadPersistedRagIndex() {
  hydrateIndex(await loadIndexSnapshot());
  return getIndexStatus();
}

export function listIndexedDocuments(user) {
  return accessibleDocuments(user);
}

export async function deleteIndexedDocument(documentId, user) {
  const documentExists = activeIndex.documents.some((document) => document.id === documentId && canManageDocument(document, user));

  if (!documentExists) {
    return false;
  }

  const nextDocuments = activeIndex.documents.filter((document) => document.id !== documentId);
  const nextRecords = activeIndex.vectorRecords
    .filter((record) => record.documentId !== documentId)
    .map((record, index) => {
      const metadata = {
        ...record.metadata,
        chunkIndex: index
      };

      return {
        ...record,
        metadata,
        document: new Document({
          pageContent: record.text,
          metadata
        })
      };
    });

  activeIndex = {
    documents: nextDocuments,
    chunks: nextRecords.map((record) => record.document),
    vectorRecords: nextRecords,
    documentName: summarizeDocumentName(nextDocuments),
    chunkCount: nextRecords.length,
    indexedAt: nextRecords.length ? new Date().toISOString() : null
  };

  await persistActiveIndex();
  return true;
}

export async function shareIndexedDocument(documentId, { accessLevel, teamId }, user) {
  const document = activeIndex.documents.find((item) => item.id === documentId);
  if (!document || !canManageDocument(document, user)) {
    const error = new Error("Document not found.");
    error.status = 404;
    throw error;
  }

  const nextAccessLevel = ["private", "team", "public"].includes(accessLevel) ? accessLevel : "private";
  const nextTeamId = nextAccessLevel === "team" ? String(teamId || "").trim() : null;

  if (nextAccessLevel === "team" && !(await canUseTeam(nextTeamId, user))) {
    const error = new Error("Choose a team you belong to before sharing this document.");
    error.status = 403;
    throw error;
  }

  activeIndex.documents = activeIndex.documents.map((item) => (
    item.id === documentId
      ? {
          ...item,
          accessLevel: nextAccessLevel,
          teamId: nextTeamId
        }
      : item
  ));

  activeIndex.vectorRecords = activeIndex.vectorRecords.map((record) => {
    if (record.documentId !== documentId) {
      return record;
    }

    const metadata = {
      ...record.metadata,
      accessLevel: nextAccessLevel,
      teamId: nextTeamId
    };

    return {
      ...record,
      teamId: nextTeamId,
      metadata,
      document: new Document({
        pageContent: record.text,
        metadata
      })
    };
  });
  activeIndex.chunks = activeIndex.vectorRecords.map((record) => record.document);

  await persistActiveIndex();
  return getIndexStatus(user);
}

export function getIndexStatus(user) {
  const documents = accessibleDocuments(user);
  const documentIds = new Set(documents.map((document) => document.id));
  const chunkCount = activeIndex.vectorRecords.filter((record) => documentIds.has(record.documentId)).length;

  return {
    ready: chunkCount > 0,
    documentName: documentNameForUser(user),
    chunkCount,
    indexedAt: activeIndex.indexedAt,
    documents,
    tokenUsage: getTokenUsage()
  };
}

export async function indexFile(filePath, options = {}) {
  return indexFiles(
    [
      {
        filePath,
        displayName: options.displayName || path.basename(filePath),
        sourceType: options.sourceType || "upload"
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
  const documentRecords = [];
  const mode = options.mode || "replace";
  const ownerId = options.ownerId || null;
  const accessLevel = ["private", "public", "team"].includes(options.accessLevel) ? options.accessLevel : "private";
  const teamId = accessLevel === "team" ? options.teamId || null : null;

  for (const file of files) {
    const filePath = typeof file === "string" ? file : file.filePath;
    const displayName = typeof file === "string" ? path.basename(file) : file.displayName || path.basename(file.filePath);
    const documentId = createId("doc");
    const documentRecord = {
      id: documentId,
      fileName: path.basename(filePath),
      displayName,
      sourceType: typeof file === "string" ? options.sourceType || "sample" : file.sourceType || options.sourceType || "sample",
      ownerId,
      teamId,
      accessLevel,
      status: "indexed",
      chunkCount: 0,
      indexedAt: new Date().toISOString()
    };
    const documents = await loadFile(filePath, displayName);
    documentRecords.push(documentRecord);
    loadedDocuments.push(...normalizeDocuments(documents, displayName, documentId, ownerId, accessLevel, teamId));
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 180
  });
  const chunks = await splitter.splitDocuments(loadedDocuments);
  const baseChunkIndex = mode === "append" ? activeIndex.vectorRecords.length : 0;
  chunks.forEach((chunk, index) => {
    chunk.metadata.chunkIndex = baseChunkIndex + index;
  });
  const embeddings = createEmbeddings();
  const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.pageContent));
  const chunkRecords = chunks.map((chunk, index) => ({
    id: createId("chunk"),
    documentId: chunk.metadata.documentId,
    text: chunk.pageContent,
    metadata: chunk.metadata,
    embedding: vectors[index],
    document: chunk
  }));

  for (const documentRecord of documentRecords) {
    documentRecord.chunkCount = chunkRecords.filter((chunk) => chunk.documentId === documentRecord.id).length;
  }

  const replaceForOwner = mode === "replace" && ownerId;
  const baseDocuments = replaceForOwner
    ? activeIndex.documents.filter((document) => document.ownerId !== ownerId)
    : mode === "append"
      ? activeIndex.documents
      : [];
  const baseDocumentIds = new Set(baseDocuments.map((document) => document.id));
  const baseRecords = replaceForOwner
    ? activeIndex.vectorRecords.filter((record) => baseDocumentIds.has(record.documentId))
    : mode === "append"
      ? activeIndex.vectorRecords
      : [];
  const nextDocuments = [...baseDocuments, ...documentRecords];
  const nextRecords = [...baseRecords, ...chunkRecords].map((record, index) => {
    const metadata = {
      ...record.metadata,
      chunkIndex: index
    };

    return {
      ...record,
      metadata,
      document: new Document({
        pageContent: record.text,
        metadata
      })
    };
  });

  activeIndex = {
    documents: nextDocuments,
    chunks: nextRecords.map((record) => record.document),
    vectorRecords: nextRecords,
    documentName: summarizeDocumentName(nextDocuments),
    chunkCount: nextRecords.length,
    indexedAt: new Date().toISOString()
  };

  await persistActiveIndex();
  return getIndexStatus();
}

async function retrieveVectorMatches(query, limit = 8, user) {
  if (!activeIndex.vectorRecords.length) {
    return [];
  }

  const embeddings = createEmbeddings();
  const queryVector = await embeddings.embedQuery(query);
  const allowedDocumentIds = accessibleDocumentIds(user);

  if (env.storageProvider === "postgres") {
    const rows = await searchVectorChunks(queryVector, limit, user);
    if (rows) {
      return rows.map((row) => documentFromRecord(row));
    }
  }

  return activeIndex.vectorRecords
    .filter((record) => allowedDocumentIds.has(record.documentId))
    .map((record) => ({
      score: cosineSimilarity(queryVector, record.embedding),
      document: record.document
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.document);
}

export async function askQuestion(question, history = [], user) {
  requireModelConfig();

  if (!accessibleDocuments(user).length) {
    const error = new Error("No document is indexed yet. Index the sample PDF or upload a document first.");
    error.status = 400;
    throw error;
  }

  const retrievalQuery = buildRetrievalQuery(question, history);
  const branchOverviewDocuments = isBranchOverviewQuestion(question) ? findBranchOverviewMatches(user) : [];
  const sourceLimit = branchOverviewDocuments.length ? 18 : 12;
  const sourceDocuments = isConversationHistoryQuestion(question)
    ? []
    : mergeDocuments(
        [...branchOverviewDocuments, ...findExactMatches(retrievalQuery, user)],
        await retrieveVectorMatches(retrievalQuery, 8, user),
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
