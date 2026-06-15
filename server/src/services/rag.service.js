import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../config/prisma.js";
import { env, requireModelConfig } from "../config/env.js";
import { answerFromContext, createEmbeddings, getTokenUsage, resetTokenUsage } from "./model.service.js";
import { createId, loadIndexSnapshot, saveIndexSnapshot, searchVectorChunks } from "./persistence.service.js";
import { canUseTeam } from "./team.service.js";
import {
  createActivity,
  listActivity,
  listDocumentVersions,
  recordDocumentVersion
} from "./activity.service.js";

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
  return Boolean(user && document);
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

function getManageableDocument(documentId, user) {
  const document = activeIndex.documents.find((item) => item.id === documentId);
  if (!document || !canManageDocument(document, user)) {
    const error = new Error("Document not found.");
    error.status = 404;
    throw error;
  }

  return document;
}

function getAccessibleDocument(documentId, user) {
  const document = activeIndex.documents.find((item) => item.id === documentId);
  if (!document || !canAccessDocument(document, user)) {
    const error = new Error("Document not found.");
    error.status = 404;
    throw error;
  }

  return document;
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
  return /\b(which|what|list|show)\b.*\b(company\s+x\s+|company\s+)?branches\b/i.test(question)
    || /\bbranches\s+(does|do)\s+company\s+x\s+(have|operate)\b/i.test(question)
    || /\b(all|every|confirmed|global|worldwide)\b.*\bbranches\b/i.test(question)
    || /\bbranch\s+locations\b/i.test(question);
}

function isDocumentInventoryQuestion(question) {
  return /\b(list|show|what|which)\b.*\b(documents|sources|files|data(?:base)?|datasets)\b/i.test(question)
    || /\bhow many\b.*\b(documents|sources|files|datasets)\b/i.test(question);
}

function sourceDocumentsFromRecords(records) {
  return records.map((record, index) => ({
    id: index + 1,
    source: record.source,
    page: record.page || null,
    preview: record.preview || ""
  }));
}

function firstPageTextForDocument(documentId) {
  return activeIndex.chunks
    .filter((chunk) => chunk.metadata.documentId === documentId && pageFromMetadata(chunk.metadata) === 1)
    .sort((left, right) => Number(left.metadata.chunkIndex || 0) - Number(right.metadata.chunkIndex || 0))
    .map((chunk) => chunk.pageContent)
    .join("\n");
}

function extractLineValue(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^[- ]*${escapedLabel}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() || "";
}

function extractBranchSpecialties(text) {
  const match = text.match(/Branch Specialties\s+([\s\S]*?)(?:Branch Department Capacity|Employee Directory|$)/i);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function branchRecords(user) {
  const allowedDocumentIds = accessibleDocumentIds(user);

  return activeIndex.documents
    .filter((document) => allowedDocumentIds.has(document.id) && /company x branch/i.test(document.displayName))
    .map((document) => {
      const text = firstPageTextForDocument(document.id);
      const branch = extractLineValue(text, "Branch") || document.displayName.replace(/^company x branch\s+/i, "");
      const employeeCount = extractLineValue(text, "Employee count");
      const officeAddress = extractLineValue(text, "Office address");
      const timezone = extractLineValue(text, "Timezone");
      const director = extractLineValue(text, "Branch director");
      const operationsManager = extractLineValue(text, "Branch operations manager");
      const engineeringManager = extractLineValue(text, "Branch engineering manager");
      const mainProject = extractLineValue(text, "Main branch project");
      const specialties = extractBranchSpecialties(text);

      return {
        document,
        branch,
        employeeCount,
        officeAddress,
        timezone,
        director,
        operationsManager,
        engineeringManager,
        mainProject,
        specialties,
        source: document.displayName,
        page: 1,
        preview: text.slice(0, 240)
      };
    })
    .sort((left, right) => left.branch.localeCompare(right.branch));
}

function findRequestedBranch(question, records) {
  const normalizedQuestion = question.toLowerCase();

  return records.find((record) => {
    const branch = record.branch.toLowerCase();
    const displayName = record.document.displayName.toLowerCase();
    const [city, country] = branch.split(",").map((part) => part.trim());

    return normalizedQuestion.includes(branch)
      || normalizedQuestion.includes(displayName)
      || (city && normalizedQuestion.includes(city))
      || (country && normalizedQuestion.includes(country));
  }) || null;
}

function findRequestedBranches(question, records) {
  const normalizedQuestion = question.toLowerCase();
  const seen = new Set();
  const matches = [];

  for (const record of records) {
    const branch = record.branch.toLowerCase();
    const displayName = record.document.displayName.toLowerCase();
    const [city, country] = branch.split(",").map((part) => part.trim());
    const isMatch = normalizedQuestion.includes(branch)
      || normalizedQuestion.includes(displayName)
      || (city && normalizedQuestion.includes(city))
      || (country && normalizedQuestion.includes(country));

    if (isMatch && !seen.has(record.document.id)) {
      seen.add(record.document.id);
      matches.push(record);
    }
  }

  return matches;
}

function buildBranchListFastAnswer(records) {
  const answerLines = records.map((record, index) => {
    const details = [
      record.employeeCount ? `${record.employeeCount} employees` : "",
      record.mainProject ? `main project: ${record.mainProject}` : ""
    ].filter(Boolean).join(" - ");

    return `${index + 1}. ${record.branch}${details ? ` (${details})` : ""}`;
  });

  return {
    answer: `Company X has ${records.length} indexed branches:\n\n${answerLines.join("\n")}`,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    },
    tokenUsage: getTokenUsage(),
    sources: sourceDocumentsFromRecords(records)
  };
}

function buildBranchDetailFastAnswer(record) {
  const lines = [
    `${record.branch}`,
    record.employeeCount ? `Employees: ${record.employeeCount}` : "",
    record.officeAddress ? `Office address: ${record.officeAddress}` : "",
    record.timezone ? `Timezone: ${record.timezone}` : "",
    record.director ? `Branch director: ${record.director}` : "",
    record.operationsManager ? `Operations manager: ${record.operationsManager}` : "",
    record.engineeringManager ? `Engineering manager: ${record.engineeringManager}` : "",
    record.mainProject ? `Main project: ${record.mainProject}` : "",
    record.specialties.length ? `Specialties: ${record.specialties.join(", ")}` : ""
  ].filter(Boolean);

  return {
    answer: lines.join("\n"),
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    },
    tokenUsage: getTokenUsage(),
    sources: sourceDocumentsFromRecords([record])
  };
}

function buildBranchComparisonFastAnswer(records) {
  const lines = records.map((record) => [
    `${record.branch}`,
    `Employees: ${record.employeeCount || "not listed"}`,
    `Timezone: ${record.timezone || "not listed"}`,
    `Director: ${record.director || "not listed"}`,
    `Operations manager: ${record.operationsManager || "not listed"}`,
    `Engineering manager: ${record.engineeringManager || "not listed"}`,
    `Main project: ${record.mainProject || "not listed"}`,
    `Specialties: ${record.specialties.length ? record.specialties.join(", ") : "not listed"}`
  ].join("\n")).join("\n\n");

  return fastResult(
    `Branch comparison:\n\n${lines}`,
    sourceDocumentsFromRecords(records)
  );
}

function buildBranchDepartmentsFastAnswer(record) {
  const text = textForDocument(record.document.id, 2);
  const departments = parseDepartmentRows(text);
  if (!departments.length) {
    return null;
  }

  const total = departments.reduce((sum, row) => sum + Number(row.employees || 0), 0);
  const lines = departments.map((row, index) => (
    `${index + 1}. ${row.department}: ${row.employees} employees (${row.posts})`
  ));

  return fastResult(
    `${record.branch} has ${total} employees across these departments:\n\n${lines.join("\n")}`,
    sourceDocumentsFromRecords([record])
  );
}

function parseBranchProjectRows(text) {
  const rows = [];
  const seen = new Set();
  const pattern = /^\|\s*([A-Z]{2}-[A-Z0-9-]+)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*(\d+)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|/gm;
  let match;

  while ((match = pattern.exec(text))) {
    const code = match[1].trim();
    if (seen.has(code)) {
      continue;
    }

    seen.add(code);
    rows.push({
      code,
      name: match[2].trim(),
      manager: match[3].trim(),
      deputy: match[4].trim(),
      status: match[5].trim(),
      employees: match[6].trim(),
      budget: match[7].trim(),
      deadline: match[8].trim(),
      kpi: match[9].trim(),
      risk: match[10].trim()
    });
  }

  return rows;
}

function branchProjectCodeFromQuestion(question) {
  return question.match(/\b[A-Z]{2}-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase() || "";
}

function buildBranchProjectsFastAnswer(record, question) {
  const text = textForDocument(record.document.id, 4);
  const projects = parseBranchProjectRows(text);
  const requestedCode = branchProjectCodeFromQuestion(question);
  const filteredProjects = requestedCode
    ? projects.filter((project) => project.code === requestedCode)
    : /\bactive\b/i.test(question)
      ? projects.filter((project) => /active/i.test(project.status))
      : projects;

  if (!filteredProjects.length) {
    return null;
  }

  const lines = filteredProjects.map((project, index) => (
    `${index + 1}. ${project.code} - ${project.name}: ${project.status}, manager ${project.manager}, deputy ${project.deputy}, ${project.employees} employees, ${project.budget}, deadline ${project.deadline}, risk: ${project.risk}`
  ));

  return fastResult(
    `${record.branch} branch projects:\n\n${lines.join("\n")}`,
    sourceDocumentsFromRecords([record])
  );
}

function isBranchProgressQuestion(question) {
  return /\b(branch|branches)\b/i.test(question)
    && /\b(progress|perform|performance|doing\s+well|good|best|healthy|strong|risk|risks|status)\b/i.test(question);
}

async function buildBranchProgressFastAnswer() {
  const branches = await prisma.companyBranch.findMany({
    include: {
      projects: true
    },
    orderBy: {
      country: "asc"
    }
  });

  if (!branches.length) {
    return null;
  }

  const statusScore = {
    Active: 4,
    Beta: 3,
    "In build": 2,
    Discovery: 1,
    Planning: 1,
    Maintenance: 1
  };
  const goodRiskPattern = /\b(delay|gap|dependency|risk|security evidence|vendor|adoption)\b/i;
  const scored = branches.map((branch) => {
    const score = branch.projects.reduce((total, project) => {
      const base = statusScore[project.status] || 0;
      const riskPenalty = goodRiskPattern.test(project.risk || "") ? 0.5 : 0;
      return total + base - riskPenalty;
    }, 0);
    const activeCount = branch.projects.filter((project) => /active|beta/i.test(project.status || "")).length;

    return {
      branch,
      score,
      activeCount,
      projectSummary: branch.projects
        .map((project) => `${project.code}: ${project.status}${project.risk ? `, risk: ${project.risk}` : ""}`)
        .join("; ")
    };
  }).sort((left, right) => right.score - left.score || right.activeCount - left.activeCount);

  const top = scored.slice(0, 3);
  const lines = top.map((item, index) => (
    `${index + 1}. ${item.branch.name} - strongest progress signal: ${item.activeCount} active/beta projects, score ${item.score.toFixed(1)}.\n   ${item.projectSummary}`
  ));

  return fastResult(
    `The branches showing the best progress are:\n\n${lines.join("\n\n")}`,
    top.map((item, index) => ({
      id: index + 1,
      source: item.branch.sourceFile,
      page: null,
      preview: `${item.branch.name} branch progress`
    }))
  );
}

function buildBranchLocationsFastAnswer(records) {
  const lines = records.map((record, index) => (
    `${index + 1}. ${record.branch}: ${record.officeAddress || "address not listed"}${record.timezone ? ` (${record.timezone})` : ""}`
  ));

  return fastResult(
    `Company X branch locations:\n\n${lines.join("\n")}`,
    sourceDocumentsFromRecords(records)
  );
}

function buildBranchEmployeeTotalFastAnswer(records) {
  const total = records.reduce((sum, record) => sum + Number(record.employeeCount || 0), 0);
  const lines = records.map((record) => `${record.branch}: ${record.employeeCount || 0}`);

  return fastResult(
    `Company X has ${total} employees across indexed branch documents:\n\n${lines.join("\n")}`,
    sourceDocumentsFromRecords(records)
  );
}

function parseBranchEmployeeRows(text) {
  const rows = [];
  const seen = new Set();
  const pattern = /^\|\s*(CX-[A-Z]{2}-\d{3})\s*\|\s*([^|\n]+?)\s*\|/gm;
  let match;

  while ((match = pattern.exec(text))) {
    const id = match[1].trim().toUpperCase();
    const name = match[2].trim();
    const key = id;

    if (seen.has(key) || /^-+$|employee name/i.test(name)) {
      continue;
    }

    seen.add(key);
    rows.push({ id, name });
  }

  return rows;
}

function isBranchEmployeeDirectoryQuestion(question) {
  return /\b(employee|employees|staff|people|directory|names?)\b/i.test(question)
    && /\b(list|show|all|who|name|names|employee|employees|staff|people|directory)\b/i.test(question);
}

function buildBranchEmployeesFastAnswer(record, question) {
  if (!isBranchEmployeeDirectoryQuestion(question)) {
    return null;
  }

  const text = textForDocument(record.document.id, 8);
  const employees = parseBranchEmployeeRows(text);
  if (!employees.length) {
    return null;
  }

  const lines = employees.map((employee, index) => `${index + 1}. ${employee.name} (${employee.id})`);
  const expectedCount = Number(record.employeeCount || 0);
  const countText = expectedCount && expectedCount !== employees.length
    ? `${employees.length} named employees found in the directory; branch total is ${expectedCount}.`
    : `${record.branch} has ${employees.length} named employees.`;

  return fastResult(
    `${countText}\n\n${lines.join("\n")}`,
    sourceDocumentsFromRecords([record])
  );
}

function buildBranchEmployeeBriefFastAnswer(records, question) {
  const employeeId = employeeIdFromQuestion(question);
  if (!employeeId) {
    return null;
  }

  for (const record of records) {
    const text = textForDocument(record.document.id, 40);
    const escapedId = employeeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(${escapedId}\\s+-\\s+[\\s\\S]*?)(?=\\nCX-[A-Z]{2}-\\d{3}\\s+-\\s+|$)`, "i"));

    if (!match) {
      continue;
    }

    const seenLines = new Set();
    const block = match[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line || seenLines.has(line)) {
          return false;
        }

        seenLines.add(line);
        return true;
      });
    const wantsTasks = /\b(task|tasks|daily|work|brief)\b/i.test(question);
    const relevantLines = wantsTasks
      ? block.filter((line) => /daily tasks|review|prepare|approve|meet|coordinate|update|monitor|support|write|check|plan/i.test(line)).slice(0, 12)
      : block.slice(0, 22);

    return fastResult(
      relevantLines.join("\n"),
      sourceDocumentsFromRecords([record])
    );
  }

  return null;
}

function buildLinkedEmployeeProfileFastAnswer(user, records) {
  const employeeId = employeeIdForUser(user);
  if (!employeeId) {
    return fastResult(
      "I do not know which employee profile belongs to you yet. Link your app account to an employee ID first, then I can answer personal questions from the indexed database.",
      []
    );
  }

  if (user.employeeProfile?.email) {
    const profile = user.employeeProfile;
    const formatProfileDate = (value) => {
      if (!value) {
        return "";
      }

      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
    };
    const lines = [
      `Linked employee: ${profile.name} (${profile.id})`,
      `Branch: ${profile.branch || "not listed"}`,
      `Department: ${profile.department || "not listed"}`,
      `Post: ${profile.post || "not listed"}`,
      `Email: ${profile.email}`,
      profile.phone ? `Phone: ${profile.phone}` : "",
      profile.dateOfBirth ? `Date of birth: ${formatProfileDate(profile.dateOfBirth)}` : "",
      profile.startDate ? `Start date: ${formatProfileDate(profile.startDate)}` : "",
      profile.salary ? `Salary: ${profile.salary}` : "",
      profile.manager ? `Manager: ${profile.manager}` : "",
      profile.employmentType ? `Employment type: ${profile.employmentType}` : "",
      profile.workMode ? `Work mode: ${profile.workMode}` : "",
      profile.shift ? `Shift: ${profile.shift}` : "",
      profile.responsibilityArea ? `Responsibility area: ${profile.responsibilityArea}` : "",
      profile.branchProject ? `Branch project: ${profile.branchProject}` : "",
      profile.localWorkstream ? `Local workstream: ${profile.localWorkstream}` : "",
      profile.projectManager ? `Project manager: ${profile.projectManager}` : "",
      profile.projectStatus ? `Project status: ${profile.projectStatus}` : "",
      profile.projectBudget ? `Project budget: ${profile.projectBudget}` : "",
      profile.projectDeadline ? `Project deadline: ${profile.projectDeadline}` : "",
      profile.projectKpi ? `Project KPI: ${profile.projectKpi}` : "",
      profile.projectRisk ? `Current project risk: ${profile.projectRisk}` : "",
      profile.skills?.length ? `Skills: ${profile.skills.join(", ")}` : "",
      profile.languages?.length ? `Languages: ${profile.languages.join(", ")}` : "",
      profile.systems?.length ? `Main systems used: ${profile.systems.join(", ")}` : "",
      profile.performanceBand ? `Performance band: ${profile.performanceBand}` : "",
      profile.accessLevel ? `Access level: ${profile.accessLevel}` : "",
      profile.ptoBalance ? `PTO balance: ${profile.ptoBalance}` : "",
      profile.weeklyDeliverables?.length ? `Weekly deliverables: ${profile.weeklyDeliverables.join("; ")}` : "",
      profile.dailyTasks?.length ? `Daily tasks: ${profile.dailyTasks.join("; ")}` : ""
    ].filter(Boolean);

    return fastResult(lines.join("\n"), [{
      id: 1,
      source: profile.source || "Company X structured employee database",
      page: null,
      preview: `${profile.id} ${profile.name}`
    }]);
  }

  const question = `tell me all information about ${employeeId}`;
  const branchAnswer = buildBranchEmployeeBriefFastAnswer(records, question);
  if (branchAnswer) {
    const linkedName = user.employeeProfile?.name ? `Linked employee: ${user.employeeProfile.name} (${employeeId})\n` : "";
    return {
      ...branchAnswer,
      answer: `${linkedName}${branchAnswer.answer}`
    };
  }

  const document = employeeKnowledgeDocument(user);
  if (document) {
    const employeeAnswer = buildEmployeeBriefFastAnswer(document, question);
    if (employeeAnswer) {
      const linkedName = user.employeeProfile?.name ? `Linked employee: ${user.employeeProfile.name} (${employeeId})\n` : "";
      return {
        ...employeeAnswer,
        answer: `${linkedName}${employeeAnswer.answer}`
      };
    }
  }

  return fastResult(
    `Your account is linked to ${employeeId}, but I could not find that employee profile in the indexed database.`,
    []
  );
}

function buildDocumentInventoryFastAnswer(user) {
  const documents = accessibleDocuments(user)
    .slice()
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const answerLines = documents.map((document, index) => (
    `${index + 1}. ${document.displayName} (${document.chunkCount} chunks, ${document.accessLevel || "public"})`
  ));

  return {
    answer: `There are ${documents.length} indexed documents:\n\n${answerLines.join("\n")}`,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    },
    tokenUsage: getTokenUsage(),
    sources: documents.map((document, index) => ({
      id: index + 1,
      source: document.displayName,
      page: null,
      preview: `${document.chunkCount} chunks`
    }))
  };
}

function buildDatabaseAccessFastAnswer(user) {
  const documents = accessibleDocuments(user);
  const documentIds = new Set(documents.map((document) => document.id));
  const chunkCount = activeIndex.vectorRecords.filter((record) => documentIds.has(record.documentId)).length;

  return fastResult(
    `Yes. I can access the app's indexed database for your account: ${documents.length} documents and ${chunkCount} searchable chunks. I use that database to answer questions about employees, branches, projects, policies, and uploaded sources.`,
    documents.slice(0, 8).map((document, index) => ({
      id: index + 1,
      source: document.displayName,
      page: null,
      preview: `${document.chunkCount} chunks`
    }))
  );
}

function employeeKnowledgeDocument(user) {
  const allowedDocumentIds = accessibleDocumentIds(user);

  return activeIndex.documents.find((document) => (
    allowedDocumentIds.has(document.id)
    && /employee knowledge base/i.test(document.displayName)
  )) || null;
}

function textForDocument(documentId, maxPages = 8) {
  return activeIndex.chunks
    .filter((chunk) => chunk.metadata.documentId === documentId && Number(pageFromMetadata(chunk.metadata) || 0) <= maxPages)
    .sort((left, right) => Number(left.metadata.chunkIndex || 0) - Number(right.metadata.chunkIndex || 0))
    .map((chunk) => chunk.pageContent)
    .join("\n");
}

function fastUsage() {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
}

function fastResult(answer, sources = []) {
  return {
    answer,
    usage: fastUsage(),
    tokenUsage: getTokenUsage(),
    sources
  };
}

function sourceForDocument(document, preview = "") {
  return [{
    id: 1,
    source: document.displayName,
    page: null,
    preview
  }];
}

function formatProfileDate(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
}

function requestedEmployeeFields(question) {
  const fields = [];
  const normalized = question.toLowerCase();
  const add = (field) => {
    if (!fields.includes(field)) {
      fields.push(field);
    }
  };

  if (/\bsalary|pay|compensation\b/i.test(normalized)) add("salary");
  if (/\bmanager|reports?\s+to\b/i.test(normalized)) add("manager");
  if (/\bprojects?|workstream|working\s+on\b/i.test(normalized)) add("project");
  if (/\bdaily\s+tasks?|tasks?|work\b/i.test(normalized)) add("dailyTasks");
  if (/\bbranch|country|location\b/i.test(normalized)) add("branch");
  if (/\bdepartment|team\b/i.test(normalized)) add("department");
  if (/\brole|job|post|title\b/i.test(normalized)) add("post");
  if (/\bemail|mail\b/i.test(normalized)) add("email");
  if (/\bphone|number\b/i.test(normalized)) add("phone");
  if (/\bshift|hours?\b/i.test(normalized)) add("shift");
  if (/\bpto|vacation|leave\b/i.test(normalized)) add("ptoBalance");
  if (/\bskills?\b/i.test(normalized)) add("skills");
  if (/\blanguages?\b/i.test(normalized)) add("languages");
  if (/\bsystems?|tools?\b/i.test(normalized)) add("systems");
  if (/\baccess\b/i.test(normalized)) add("accessLevel");

  return fields;
}

function employeeFieldLines(employee, fields) {
  const fieldLine = {
    salary: () => employee.salary ? `Salary: ${employee.salary}` : "",
    manager: () => employee.manager ? `Manager: ${employee.manager}` : "",
    project: () => [
      employee.project ? `Project: ${employee.project}` : "",
      employee.branchProject ? `Branch project: ${employee.branchProject}` : "",
      employee.localWorkstream ? `Local workstream: ${employee.localWorkstream}` : "",
      employee.projectManager ? `Project manager: ${employee.projectManager}` : "",
      employee.projectStatus ? `Project status: ${employee.projectStatus}` : "",
      employee.projectBudget ? `Project budget: ${employee.projectBudget}` : "",
      employee.projectDeadline ? `Project deadline: ${employee.projectDeadline}` : "",
      employee.projectKpi ? `Project KPI: ${employee.projectKpi}` : "",
      employee.projectRisk ? `Current project risk: ${employee.projectRisk}` : ""
    ].filter(Boolean).join("\n"),
    dailyTasks: () => employee.dailyTasks?.length ? `Daily tasks:\n${employee.dailyTasks.map((task) => `- ${task}`).join("\n")}` : "",
    branch: () => `Branch: ${employee.branch?.name || employee.location || "not listed"}`,
    department: () => employee.department ? `Department: ${employee.department}` : "",
    post: () => employee.post ? `Post: ${employee.post}` : "",
    email: () => employee.email ? `Email: ${employee.email}` : "",
    phone: () => employee.phone ? `Phone: ${employee.phone}` : "",
    shift: () => employee.shift ? `Shift: ${employee.shift}` : "",
    ptoBalance: () => employee.ptoBalance ? `PTO balance: ${employee.ptoBalance}` : "",
    skills: () => employee.skills?.length ? `Skills: ${employee.skills.join(", ")}` : "",
    languages: () => employee.languages?.length ? `Languages: ${employee.languages.join(", ")}` : "",
    systems: () => employee.systems?.length ? `Main systems used: ${employee.systems.join(", ")}` : "",
    accessLevel: () => employee.accessLevel ? `Access level: ${employee.accessLevel}` : ""
  };

  return fields
    .map((field) => fieldLine[field]?.() || "")
    .filter(Boolean);
}

function fullEmployeeLines(employee) {
  return [
    `${employee.employeeId} - ${employee.name}`,
    `Branch: ${employee.branch?.name || employee.location || "not listed"}`,
    employee.department ? `Department: ${employee.department}` : "",
    employee.post ? `Post: ${employee.post}` : "",
    employee.email ? `Email: ${employee.email}` : "",
    employee.phone ? `Phone: ${employee.phone}` : "",
    employee.dateOfBirth ? `Date of birth: ${formatProfileDate(employee.dateOfBirth)}` : "",
    employee.startDate ? `Start date: ${formatProfileDate(employee.startDate)}` : "",
    employee.salary ? `Salary: ${employee.salary}` : "",
    employee.manager ? `Manager: ${employee.manager}` : "",
    employee.employmentType ? `Employment type: ${employee.employmentType}` : "",
    employee.workMode ? `Work mode: ${employee.workMode}` : "",
    employee.shift ? `Shift: ${employee.shift}` : "",
    employee.responsibilityArea ? `Responsibility area: ${employee.responsibilityArea}` : "",
    employee.branchProject ? `Branch project: ${employee.branchProject}` : "",
    employee.localWorkstream ? `Local workstream: ${employee.localWorkstream}` : "",
    employee.projectManager ? `Project manager: ${employee.projectManager}` : "",
    employee.projectStatus ? `Project status: ${employee.projectStatus}` : "",
    employee.projectBudget ? `Project budget: ${employee.projectBudget}` : "",
    employee.projectDeadline ? `Project deadline: ${employee.projectDeadline}` : "",
    employee.projectKpi ? `Project KPI: ${employee.projectKpi}` : "",
    employee.projectRisk ? `Current project risk: ${employee.projectRisk}` : "",
    employee.skills?.length ? `Skills: ${employee.skills.join(", ")}` : "",
    employee.languages?.length ? `Languages: ${employee.languages.join(", ")}` : "",
    employee.systems?.length ? `Main systems used: ${employee.systems.join(", ")}` : "",
    employee.performanceBand ? `Performance band: ${employee.performanceBand}` : "",
    employee.accessLevel ? `Access level: ${employee.accessLevel}` : "",
    employee.ptoBalance ? `PTO balance: ${employee.ptoBalance}` : "",
    employee.weeklyDeliverables?.length ? `Weekly deliverables: ${employee.weeklyDeliverables.join("; ")}` : "",
    employee.dailyTasks?.length ? `Daily tasks:\n${employee.dailyTasks.map((task) => `- ${task}`).join("\n")}` : ""
  ].filter(Boolean);
}

function parseDepartmentRows(text) {
  const rows = [];
  const seen = new Set();
  const pattern = /^\|\s*([^|\n]+?)\s*\|\s*(\d+)\s*\|\s*([^|\n]+?)\s*\|/gm;
  let match;

  while ((match = pattern.exec(text))) {
    const department = match[1].trim();
    const key = department.toLowerCase();
    if (/^-+$|department/i.test(department) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    rows.push({
      department,
      employees: match[2].trim(),
      posts: match[3].trim()
    });
  }

  return rows;
}

function parseProjectRows(text) {
  const rows = [];
  const seen = new Set();
  const pattern = /^\|\s*(PX-[^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|/gm;
  let match;

  while ((match = pattern.exec(text))) {
    const code = match[1].trim();
    const key = code.toUpperCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rows.push({
      code,
      name: match[2].trim(),
      owner: match[3].trim(),
      manager: match[4].trim(),
      status: match[5].trim(),
      budget: match[6].trim(),
      deadline: match[7].trim(),
      goal: match[8].trim()
    });
  }

  return rows;
}

function projectCodeFromQuestion(question) {
  return question.match(/\bPX-[a-z0-9-]+\b/i)?.[0]?.toUpperCase() || "";
}

function employeeIdFromQuestion(question) {
  return question.match(/\bCX-(?:[A-Z]{2}-)?\d{3}\b/i)?.[0]?.toUpperCase() || "";
}

function employeeIdForUser(user) {
  return user?.employeeProfile?.id || user?.employeeId || "";
}

function isCurrentUserProfileQuestion(question) {
  return /\bwho\s+am\s+i\b/i.test(question)
    || /\bwhat\s+is\s+my\s+(name|profile|employee\s+id|employee|role|job|department|branch|salary|manager|tasks?)\b/i.test(question)
    || (/\b(me|my|myself)\b/i.test(question)
      && /\b(profile|information|info|details|employee|about|baout|salary|manager|tasks|role|job|department|branch|identity)\b/i.test(question));
}

async function buildStructuredEmployeeFastAnswer(question) {
  const employeeId = employeeIdFromQuestion(question);
  if (!employeeId) {
    return null;
  }

  const employee = await prisma.companyEmployee.findUnique({
    where: {
      employeeId
    },
    include: {
      branch: true
    }
  });

  if (!employee) {
    return null;
  }

  const fields = requestedEmployeeFields(question);
  const lines = fields.length
    ? [
        `${employee.employeeId} - ${employee.name}`,
        ...employeeFieldLines(employee, fields)
      ]
    : fullEmployeeLines(employee);

  return fastResult(lines.join("\n"), [{
    id: 1,
    source: employee.sourceFile || "Company X structured employee database",
    page: null,
    preview: `${employee.employeeId} ${employee.name}`
  }]);
}

function buildCompanyOverviewFastAnswer(document, text) {
  const overview = text.match(/Company Overview\s+([\s\S]*?)(?:Department Summary|$)/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();

  if (!overview) {
    return null;
  }

  return fastResult(overview, sourceForDocument(document, overview.slice(0, 240)));
}

function buildDepartmentFastAnswer(document, text) {
  const departments = parseDepartmentRows(text);
  if (!departments.length) {
    return null;
  }

  const total = departments.reduce((sum, row) => sum + Number(row.employees || 0), 0);
  const lines = departments.map((row, index) => (
    `${index + 1}. ${row.department}: ${row.employees} employees (${row.posts})`
  ));

  return fastResult(
    `Company X has ${total} employees across these departments:\n\n${lines.join("\n")}`,
    sourceForDocument(document, "Department Summary")
  );
}

function buildProjectListFastAnswer(document, projects, onlyActive = false) {
  const filteredProjects = onlyActive
    ? projects.filter((project) => /active/i.test(project.status))
    : projects;

  if (!filteredProjects.length) {
    return null;
  }

  const lines = filteredProjects.map((project, index) => (
    `${index + 1}. ${project.code} - ${project.name}: ${project.status}, manager ${project.manager}, ${project.budget}, deadline ${project.deadline}`
  ));

  return fastResult(
    `${onlyActive ? "Active projects" : "Projects"}:\n\n${lines.join("\n")}`,
    sourceForDocument(document, "Project Portfolio")
  );
}

function buildProjectDetailFastAnswer(document, projects, code) {
  const project = projects.find((item) => item.code.toUpperCase() === code);
  if (!project) {
    return null;
  }

  return fastResult(
    [
      `${project.code} - ${project.name}`,
      `Owner: ${project.owner}`,
      `Manager: ${project.manager}`,
      `Status: ${project.status}`,
      `Budget: ${project.budget}`,
      `Deadline: ${project.deadline}`,
      `Goal: ${project.goal}`
    ].join("\n"),
    sourceForDocument(document, `${project.code} ${project.name}`)
  );
}

function buildProjectFieldFastAnswer(document, projects, question) {
  const lowerQuestion = question.toLowerCase();
  const project = projects.find((item) => lowerQuestion.includes(item.name.toLowerCase())) || null;

  if (!project) {
    return null;
  }

  if (/\b(who|manager|manage|manages|managed)\b/i.test(question)) {
    return fastResult(`${project.name} is managed by ${project.manager}.`, sourceForDocument(document, project.code));
  }

  if (/\b(status)\b/i.test(question)) {
    return fastResult(`${project.name} status: ${project.status}.`, sourceForDocument(document, project.code));
  }

  if (/\b(budget|cost)\b/i.test(question)) {
    return fastResult(`${project.name} budget: ${project.budget}.`, sourceForDocument(document, project.code));
  }

  if (/\b(deadline|due|when)\b/i.test(question)) {
    return fastResult(`${project.name} deadline: ${project.deadline}.`, sourceForDocument(document, project.code));
  }

  return buildProjectDetailFastAnswer(document, projects, project.code);
}

function buildProjectCountFastAnswer(document, projects) {
  const statusCounts = projects.reduce((counts, project) => ({
    ...counts,
    [project.status]: (counts[project.status] || 0) + 1
  }), {});
  const statusText = Object.entries(statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");

  return fastResult(
    `Company X has ${projects.length} listed projects. Status breakdown: ${statusText}.`,
    sourceForDocument(document, "Project Portfolio")
  );
}

function buildExactSnippetFastAnswer(question, user) {
  const isExactFastQuestion = /\b(policy|policies|daily tasks|daily task|salary|salaries|finance|security|CX-\d{3}|CX-[A-Z]{2}-\d{3})\b/i.test(question);
  if (!isExactFastQuestion) {
    return null;
  }

  const matches = findExactMatches(question, user, 4);
  if (!matches.length) {
    return null;
  }

  const answer = matches.map((document, index) => {
    const page = pageFromMetadata(document.metadata);
    const label = page ? `${document.metadata.source}, page ${page}` : document.metadata.source;
    const snippet = document.pageContent
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 650);

    return `${index + 1}. ${label}\n${snippet}`;
  }).join("\n\n");

  return fastResult(
    answer,
    matches.map((document, index) => ({
      id: index + 1,
      source: document.metadata.source,
      page: pageFromMetadata(document.metadata),
      preview: document.pageContent.slice(0, 240)
    }))
  );
}

function buildEmployeeBriefFastAnswer(document, question) {
  const employeeId = employeeIdFromQuestion(question);
  if (!employeeId) {
    return null;
  }

  const text = textForDocument(document.id, 40);
  const escapedId = employeeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(${escapedId}\\s+-\\s+[\\s\\S]*?)(?=\\nCX-(?:[A-Z]{2}-)?\\d{3}\\s+-\\s+|$)`, "i"));
  if (!match) {
    return null;
  }

  const seenLines = new Set();
  const block = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || seenLines.has(line)) {
        return false;
      }

      seenLines.add(line);
      return true;
    });
  const wantsTasks = /\b(task|tasks|daily|work)\b/i.test(question);
  const relevantLines = wantsTasks
    ? block.filter((line) => /daily tasks|review|prepare|approve|meet|coordinate|update|monitor|support|write|check|plan/i.test(line)).slice(0, 12)
    : block.slice(0, 22);

  return fastResult(
    relevantLines.join("\n"),
    sourceForDocument(document, `${employeeId} employee brief`)
  );
}

function tryEmployeeKnowledgeFastAnswer(question, user) {
  const document = employeeKnowledgeDocument(user);
  if (!document) {
    return null;
  }

  const text = textForDocument(document.id, 5);
  const normalizedQuestion = question.toLowerCase();
  const projects = parseProjectRows(text);
  const projectCode = projectCodeFromQuestion(question);
  const employeeBrief = buildEmployeeBriefFastAnswer(document, question);

  if (employeeBrief) {
    return employeeBrief;
  }

  if (/\bwhat\s+is\s+company\s+x\b/i.test(question) || /\bcompany overview\b/i.test(question)) {
    return buildCompanyOverviewFastAnswer(document, text);
  }

  if (/\bsummarize\b.*\b(employee knowledge base|company x)\b/i.test(question)) {
    const overview = buildCompanyOverviewFastAnswer(document, text);
    const departmentCount = parseDepartmentRows(text).length;
    const summary = [
      overview?.answer,
      departmentCount ? `It also includes ${departmentCount} departments and ${projects.length} major projects.` : "",
      "It covers company structure, project portfolio, policies, employee details, and operational knowledge for testing the chat."
    ].filter(Boolean).join("\n");

    return fastResult(summary, sourceForDocument(document, "Company overview and project portfolio"));
  }

  if (/\bdepartments?\b/i.test(question) && /\b(employee|count|list|summary|department)/i.test(question)) {
    return buildDepartmentFastAnswer(document, text);
  }

  if (projectCode) {
    return buildProjectDetailFastAnswer(document, projects, projectCode);
  }

  const projectFieldAnswer = buildProjectFieldFastAnswer(document, projects, question);
  if (projectFieldAnswer) {
    return projectFieldAnswer;
  }

  if (/\bprojects?\b/i.test(question)) {
    if (/\bhow many\b/i.test(question)) {
      return buildProjectCountFastAnswer(document, projects);
    }

    return buildProjectListFastAnswer(document, projects, /\bactive\b/i.test(normalizedQuestion));
  }

  if (/\bgoals?\b/i.test(question) && /\b(company|year|business)\b/i.test(question)) {
    const overview = buildCompanyOverviewFastAnswer(document, text);
    const goalSentence = overview?.answer.match(/The main business goals this year are ([^.]+)\./i)?.[1];
    if (goalSentence) {
      return fastResult(`The main business goals this year are ${goalSentence}.`, sourceForDocument(document, goalSentence));
    }
  }

  return buildExactSnippetFastAnswer(question, user);
}

async function tryFastDatabaseAnswer(question, user) {
  if (/\b(you|u)\b.*\b(access|connect|connected)\b.*\b(database|db)\b/i.test(question)
    || /\b(database|db)\b.*\b(access|connect|connected)\b/i.test(question)) {
    return buildDatabaseAccessFastAnswer(user);
  }

  if (isDocumentInventoryQuestion(question)) {
    return buildDocumentInventoryFastAnswer(user);
  }

  const structuredEmployeeAnswer = await buildStructuredEmployeeFastAnswer(question);
  if (structuredEmployeeAnswer) {
    return structuredEmployeeAnswer;
  }

  const records = branchRecords(user);
  if (isCurrentUserProfileQuestion(question)) {
    return buildLinkedEmployeeProfileFastAnswer(user, records);
  }

  if (isBranchProgressQuestion(question)) {
    const branchProgressAnswer = await buildBranchProgressFastAnswer();
    if (branchProgressAnswer) {
      return branchProgressAnswer;
    }
  }

  if (records.length && (isBranchOverviewQuestion(question) || /\bhow many\b.*\bbranches\b/i.test(question))) {
    return buildBranchListFastAnswer(records);
  }

  if (records.length && /\b(branch\s+)?(location|locations|office|offices|address|addresses|timezone|timezones)\b/i.test(question) && !findRequestedBranch(question, records)) {
    return buildBranchLocationsFastAnswer(records);
  }

  if (records.length && /\bhow many\b.*\bemployees\b.*\b(branch|branches)\b/i.test(question)) {
    return buildBranchEmployeeTotalFastAnswer(records);
  }

  const branchEmployeeBrief = buildBranchEmployeeBriefFastAnswer(records, question);
  if (branchEmployeeBrief) {
    return branchEmployeeBrief;
  }

  const requestedBranches = records.length ? findRequestedBranches(question, records) : [];
  if (requestedBranches.length >= 2 && /\b(compare|comparison|difference|differences|versus|vs|between)\b/i.test(question)) {
    return buildBranchComparisonFastAnswer(requestedBranches);
  }

  const requestedBranch = records.length ? findRequestedBranch(question, records) : null;
  if (requestedBranch) {
    const branchEmployees = buildBranchEmployeesFastAnswer(requestedBranch, question);
    if (branchEmployees) {
      return branchEmployees;
    }
  }

  if (requestedBranch && /\b(department|departments|capacity|team structure)\b/i.test(question)) {
    return buildBranchDepartmentsFastAnswer(requestedBranch);
  }

  if (requestedBranch && /\b(project|projects|portfolio|staffing|budget|deadline|risk|kpi|manager|deputy)\b/i.test(question)) {
    const branchProjectAnswer = buildBranchProjectsFastAnswer(requestedBranch, question);
    if (branchProjectAnswer) {
      return branchProjectAnswer;
    }
  }

  const asksBranchDetails = /\b(branch|office|timezone|director|manager|project|specialt(?:y|ies)|employee count|employees)\b/i.test(question);
  if (requestedBranch && asksBranchDetails) {
    return buildBranchDetailFastAnswer(requestedBranch);
  }

  const employeeAnswer = tryEmployeeKnowledgeFastAnswer(question, user);
  if (employeeAnswer) {
    return employeeAnswer;
  }

  return null;
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

export async function getIndexedDocumentDetails(documentId, user) {
  const document = getAccessibleDocument(documentId, user);

  return {
    document,
    versions: await listDocumentVersions(document.id),
    activity: await listActivity({
      entityType: "document",
      entityId: document.id
    })
  };
}

export async function deleteIndexedDocument(documentId, user) {
  const document = activeIndex.documents.find((item) => item.id === documentId && canManageDocument(item, user));

  if (!document) {
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
  await createActivity({
    actor: user,
    action: "document.deleted",
    entityType: "document",
    entityId: document.id,
    message: `Deleted ${document.displayName}.`,
    metadata: {
      fileName: document.fileName,
      version: document.version || 1
    }
  });
  return true;
}

export async function shareIndexedDocument(documentId, { accessLevel, teamId }, user) {
  getManageableDocument(documentId, user);

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
  await createActivity({
    actor: user,
    action: "document.shared",
    entityType: "document",
    entityId: documentId,
    message: `Changed sharing to ${nextAccessLevel}.`,
    metadata: {
      accessLevel: nextAccessLevel,
      teamId: nextTeamId
    }
  });
  return getIndexStatus(user);
}

export async function renameIndexedDocument(documentId, { displayName }, user) {
  const document = getManageableDocument(documentId, user);

  const nextDisplayName = String(displayName || "").trim();
  if (!nextDisplayName) {
    const error = new Error("Document name is required.");
    error.status = 400;
    throw error;
  }

  const renamedAt = new Date().toISOString();
  activeIndex.documents = activeIndex.documents.map((document) => (
    document.id === documentId
      ? {
          ...document,
          displayName: nextDisplayName,
          renamedAt
        }
      : document
  ));

  activeIndex.vectorRecords = activeIndex.vectorRecords.map((record) => {
    if (record.documentId !== documentId) {
      return record;
    }

    const metadata = {
      ...record.metadata,
      source: nextDisplayName
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
  activeIndex.chunks = activeIndex.vectorRecords.map((record) => record.document);
  activeIndex.documentName = summarizeDocumentName(activeIndex.documents);

  await persistActiveIndex();
  await createActivity({
    actor: user,
    action: "document.renamed",
    entityType: "document",
    entityId: documentId,
    message: `Renamed ${document.displayName} to ${nextDisplayName}.`,
    metadata: {
      from: document.displayName,
      to: nextDisplayName
    }
  });
  return getIndexStatus(user);
}

export async function reindexIndexedDocument(documentId, user) {
  requireModelConfig();
  resetTokenUsage();

  const document = getManageableDocument(documentId, user);
  if (!document.storedPath) {
    const error = new Error("This document cannot be re-indexed because its source file path was not saved.");
    error.status = 400;
    throw error;
  }

  try {
    await fs.access(document.storedPath);
  } catch {
    const error = new Error("The original source file is no longer available for re-indexing.");
    error.status = 400;
    throw error;
  }

  const loadedDocuments = await loadFile(document.storedPath, document.displayName);
  const normalizedDocuments = normalizeDocuments(
    loadedDocuments,
    document.displayName,
    document.id,
    document.ownerId,
    document.accessLevel,
    document.teamId
  );
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 180
  });
  const chunks = await splitter.splitDocuments(normalizedDocuments);
  const embeddings = createEmbeddings();
  const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.pageContent));
  const indexedAt = new Date().toISOString();
  const nextVersion = Number(document.version || 1) + 1;
  const replacementRecords = chunks.map((chunk, index) => {
    const metadata = {
      ...chunk.metadata,
      chunkIndex: index,
      version: nextVersion
    };

    return {
      id: createId("chunk"),
      documentId: document.id,
      text: chunk.pageContent,
      metadata,
      teamId: document.teamId,
      embedding: vectors[index],
      document: new Document({
        pageContent: chunk.pageContent,
        metadata
      })
    };
  });

  const nextDocuments = activeIndex.documents.map((item) => (
    item.id === document.id
      ? {
          ...item,
          version: nextVersion,
          chunkCount: replacementRecords.length,
          indexedAt,
          status: "indexed"
        }
      : item
  ));
  const nextRecords = [
    ...activeIndex.vectorRecords.filter((record) => record.documentId !== document.id),
    ...replacementRecords
  ].map((record, index) => {
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
    indexedAt
  };

  await persistActiveIndex();
  const updatedDocument = nextDocuments.find((item) => item.id === document.id);
  await recordDocumentVersion(updatedDocument, "reindexed");
  await createActivity({
    actor: user,
    action: "document.reindexed",
    entityType: "document",
    entityId: document.id,
    message: `Re-indexed ${document.displayName} as version ${nextVersion}.`,
    metadata: {
      version: nextVersion,
      chunkCount: replacementRecords.length
    }
  });
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
  const accessLevel = ["private", "public", "team"].includes(options.accessLevel) ? options.accessLevel : "public";
  const teamId = accessLevel === "team" ? options.teamId || null : null;

  for (const file of files) {
    const filePath = typeof file === "string" ? file : file.filePath;
    const displayName = typeof file === "string" ? path.basename(file) : file.displayName || path.basename(file.filePath);
    const documentId = createId("doc");
    const documentRecord = {
      id: documentId,
      fileName: path.basename(filePath),
      displayName,
      originalName: typeof file === "string" ? displayName : file.originalName || displayName,
      storedPath: filePath,
      sourceType: typeof file === "string" ? options.sourceType || "sample" : file.sourceType || options.sourceType || "sample",
      ownerId,
      teamId,
      accessLevel,
      status: "indexed",
      version: 1,
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
  await Promise.all(documentRecords.map(async (documentRecord) => {
    await recordDocumentVersion(documentRecord, "indexed");
    if (options.actor) {
      await createActivity({
        actor: options.actor,
        action: "document.indexed",
        entityType: "document",
        entityId: documentRecord.id,
        message: `Indexed ${documentRecord.displayName}.`,
        metadata: {
          sourceType: documentRecord.sourceType,
          accessLevel: documentRecord.accessLevel,
          teamId: documentRecord.teamId,
          chunkCount: documentRecord.chunkCount
        }
      });
    }
  }));
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
  if (!accessibleDocuments(user).length) {
    const error = new Error("No document is indexed yet. Index the sample PDF or upload a document first.");
    error.status = 400;
    throw error;
  }

  const fastAnswer = await tryFastDatabaseAnswer(question, user);
  if (fastAnswer) {
    return fastAnswer;
  }

  requireModelConfig();

  const retrievalQuery = buildRetrievalQuery(question, history);
  const branchOverviewDocuments = isBranchOverviewQuestion(question) ? findBranchOverviewMatches(user) : [];
  const sourceLimit = branchOverviewDocuments.length ? 18 : 6;
  const sourceDocuments = isConversationHistoryQuestion(question)
    ? []
    : mergeDocuments(
        [...branchOverviewDocuments, ...findExactMatches(retrievalQuery, user)],
        await retrieveVectorMatches(retrievalQuery, 4, user),
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
      branchOverviewDocuments.length
        ? "You answer questions using the app's indexed database context. The context includes one source per Company X branch. When asked whether you have database access, say yes: you can access the indexed database available to this app and user. When asked to list branches, enumerate every branch source present in the context and do not stop after one. Keep answers concise and practical."
        : "You answer questions using the app's indexed database context. You also receive recent conversation history. You may answer questions about the conversation history directly from that history. When asked whether you have database access, say yes: you can access the indexed database available to this app and user. For company-data questions, if the answer is not in the indexed context, say you do not know from the database. Keep answers concise and practical.",
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
