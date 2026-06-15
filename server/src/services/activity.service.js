import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";

function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function actorData(actor) {
  if (!actor) {
    return {
      actorId: null,
      actorName: null,
      actorEmail: null
    };
  }

  return {
    actorId: actor.id || null,
    actorName: actor.name || null,
    actorEmail: actor.email || null
  };
}

function mapActivity(activity) {
  return {
    id: activity.id,
    actorId: activity.actorId,
    actorName: activity.actorName,
    actorEmail: activity.actorEmail,
    action: activity.action,
    entityType: activity.entityType,
    entityId: activity.entityId,
    message: activity.message,
    metadata: activity.metadata || null,
    createdAt: toIso(activity.createdAt)
  };
}

function mapVersion(version) {
  return {
    id: version.id,
    documentId: version.documentId,
    version: version.version,
    displayName: version.displayName,
    chunkCount: version.chunkCount,
    action: version.action,
    indexedAt: toIso(version.indexedAt),
    createdAt: toIso(version.createdAt)
  };
}

export async function createActivity({ actor, action, entityType, entityId, message, metadata = null }) {
  const activity = await prisma.activityLog.create({
    data: {
      id: createId("activity"),
      ...actorData(actor),
      action,
      entityType,
      entityId,
      message,
      metadata
    }
  });

  return mapActivity(activity);
}

export async function listActivity({ entityType, entityId, limit = 20 }) {
  const activity = await prisma.activityLog.findMany({
    where: {
      entityType,
      entityId
    },
    orderBy: {
      createdAt: "desc"
    },
    take: limit
  });

  return activity.map(mapActivity);
}

export async function recordDocumentVersion(document, action = "indexed") {
  const version = await prisma.documentVersion.upsert({
    where: {
      documentId_version: {
        documentId: document.id,
        version: Number(document.version || 1)
      }
    },
    update: {
      displayName: document.displayName,
      chunkCount: document.chunkCount || 0,
      action,
      indexedAt: document.indexedAt ? new Date(document.indexedAt) : new Date()
    },
    create: {
      id: createId("version"),
      documentId: document.id,
      version: Number(document.version || 1),
      displayName: document.displayName,
      chunkCount: document.chunkCount || 0,
      action,
      indexedAt: document.indexedAt ? new Date(document.indexedAt) : new Date()
    }
  });

  return mapVersion(version);
}

export async function listDocumentVersions(documentId) {
  const versions = await prisma.documentVersion.findMany({
    where: {
      documentId
    },
    orderBy: {
      version: "desc"
    }
  });

  return versions.map(mapVersion);
}
