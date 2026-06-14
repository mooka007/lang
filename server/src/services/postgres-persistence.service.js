import { prisma } from "../config/prisma.js";
import { randomUUID } from "node:crypto";

function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
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

function vectorToSqlValue(embedding) {
  const safeValues = embedding.map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  });

  return `[${safeValues.join(",")}]`;
}

function parseVector(value) {
  if (Array.isArray(value)) {
    return value.map(Number);
  }

  return String(value || "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function mapDocument(document) {
  return {
    id: document.id,
    ownerId: document.ownerId,
    teamId: document.teamId,
    fileName: document.fileName,
    displayName: document.displayName,
    originalName: document.originalName,
    storedPath: document.storedPath,
    sourceType: document.sourceType,
    accessLevel: document.accessLevel,
    status: document.status,
    version: document.version,
    chunkCount: document.chunkCount,
    indexedAt: toIso(document.indexedAt),
    renamedAt: toIso(document.renamedAt)
  };
}

function mapMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    sources: message.sources || [],
    usage: message.usage || null,
    createdAt: toIso(message.createdAt)
  };
}

export async function loadIndexSnapshot() {
  const documents = await prisma.ragDocument.findMany({
    orderBy: {
      indexedAt: "asc"
    }
  });
  const chunks = await prisma.$queryRaw`
    SELECT
      c.id,
      c.document_id AS "documentId",
      d.team_id AS "teamId",
      c.text,
      c.metadata,
      c.embedding::text AS embedding,
      c.chunk_index AS "chunkIndex",
      c.page,
      c.source
    FROM rag_chunks c
    INNER JOIN rag_documents d ON d.id = c.document_id
    ORDER BY c.chunk_index ASC
  `;
  const mappedDocuments = documents.map(mapDocument);
  const mappedChunks = chunks.map((chunk) => ({
    id: chunk.id,
    documentId: chunk.documentId,
    teamId: chunk.teamId,
    text: chunk.text,
    metadata: chunk.metadata,
    embedding: parseVector(chunk.embedding)
  }));

  return {
    version: 1,
    documentName: summarizeDocumentName(mappedDocuments),
    indexedAt: mappedDocuments.at(-1)?.indexedAt || null,
    documents: mappedDocuments,
    chunks: mappedChunks
  };
}

export async function saveIndexSnapshot(snapshot) {
  await prisma.$transaction(async (tx) => {
    await tx.ragChunk.deleteMany();
    await tx.ragDocument.deleteMany();

    for (const document of snapshot.documents || []) {
      await tx.ragDocument.create({
        data: {
          id: document.id,
          ownerId: document.ownerId || null,
          teamId: document.teamId || null,
          fileName: document.fileName || document.displayName,
          displayName: document.displayName,
          originalName: document.originalName || document.displayName,
          storedPath: document.storedPath || null,
          sourceType: document.sourceType || "upload",
          accessLevel: document.accessLevel || "private",
          status: document.status || "indexed",
          version: document.version || 1,
          chunkCount: document.chunkCount || 0,
          indexedAt: document.indexedAt ? new Date(document.indexedAt) : new Date(),
          renamedAt: document.renamedAt ? new Date(document.renamedAt) : null
        }
      });
    }

    for (const chunk of snapshot.chunks || []) {
      const metadataJson = JSON.stringify(chunk.metadata || {});
      const vector = vectorToSqlValue(chunk.embedding || []);
      const page = Number.isFinite(Number(chunk.metadata?.page)) ? Number(chunk.metadata.page) : null;
      const source = chunk.metadata?.source ? String(chunk.metadata.source) : null;
      const chunkIndex = Number.isFinite(Number(chunk.metadata?.chunkIndex)) ? Number(chunk.metadata.chunkIndex) : 0;

      await tx.$executeRaw`
        INSERT INTO rag_chunks (
          id,
          document_id,
          text,
          metadata,
          embedding,
          chunk_index,
          page,
          source
        )
        VALUES (
          ${chunk.id},
          ${chunk.documentId},
          ${chunk.text},
          ${metadataJson}::jsonb,
          ${vector}::vector,
          ${chunkIndex},
          ${page},
          ${source}
        )
      `;
    }
  });
}

export async function searchVectorChunks(queryEmbedding, limit = 8, user = null) {
  const vector = vectorToSqlValue(queryEmbedding || []);
  const ownerId = user?.id || "";
  const isAdmin = user?.role === "admin";
  const rows = await prisma.$queryRaw`
    SELECT
      c.id,
      c.document_id AS "documentId",
      c.text,
      c.metadata,
      1 - (c.embedding <=> ${vector}::vector) AS score
    FROM rag_chunks
    c
    INNER JOIN rag_documents d ON d.id = c.document_id
    WHERE (
      ${isAdmin}::boolean
      OR d.owner_id = ${ownerId}
      OR d.access_level = 'public'
      OR (
        d.access_level = 'team'
        AND d.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM team_members tm
          WHERE tm.team_id = d.team_id
          AND tm.user_id = ${ownerId}
        )
      )
    )
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `;

  return rows.map((chunk) => ({
    id: chunk.id,
    documentId: chunk.documentId,
    text: chunk.text,
    metadata: chunk.metadata,
    score: Number(chunk.score || 0)
  }));
}

export async function listConversations(ownerId = null) {
  const conversations = await prisma.conversation.findMany({
    where: ownerId
      ? {
          ownerId
        }
      : undefined,
    orderBy: {
      updatedAt: "desc"
    },
    include: {
      _count: {
        select: {
          messages: true
        }
      }
    }
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    createdAt: toIso(conversation.createdAt),
    updatedAt: toIso(conversation.updatedAt),
    messageCount: conversation._count.messages
  }));
}

export async function getConversation(conversationId, ownerId = null) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!conversation) {
    return null;
  }

  if (ownerId && conversation.ownerId !== ownerId) {
    return null;
  }

  return {
    id: conversation.id,
    ownerId: conversation.ownerId,
    title: conversation.title,
    createdAt: toIso(conversation.createdAt),
    updatedAt: toIso(conversation.updatedAt),
    messages: conversation.messages.map(mapMessage)
  };
}

export async function appendConversationTurn({ conversationId, ownerId, question, answer, sources, usage }) {
  const now = new Date();
  let conversation = conversationId
    ? await prisma.conversation.findUnique({
        where: {
          id: conversationId
        }
      })
    : null;

  if (conversation && ownerId && conversation.ownerId !== ownerId) {
    const error = new Error("Conversation not found.");
    error.status = 404;
    throw error;
  }

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        id: createId("conv"),
        ownerId,
        title: question.slice(0, 80)
      }
    });
  }

  await prisma.$transaction([
    prisma.conversation.update({
      where: {
        id: conversation.id
      },
      data: {
        updatedAt: now
      }
    }),
    prisma.message.create({
      data: {
        id: createId("msg"),
        conversationId: conversation.id,
        role: "user",
        content: question,
        createdAt: now
      }
    }),
    prisma.message.create({
      data: {
        id: createId("msg"),
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        sources: sources || [],
        usage: usage || null,
        createdAt: now
      }
    })
  ]);

  return getConversation(conversation.id);
}

export async function deleteConversation(conversationId, ownerId = null) {
  try {
    const result = await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        ...(ownerId
          ? {
              ownerId
            }
          : {})
      }
    });
    return result.count > 0;
  } catch (error) {
    if (error.code === "P2025") {
      return false;
    }
    throw error;
  }
}
