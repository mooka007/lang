CREATE TABLE "document_versions" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "display_name" TEXT NOT NULL,
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "action" TEXT NOT NULL DEFAULT 'indexed',
  "indexed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_versions_document_id_version_key" ON "document_versions"("document_id", "version");
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");

CREATE TABLE "activity_logs" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT,
  "actor_name" TEXT,
  "actor_email" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_logs_actor_id_idx" ON "activity_logs"("actor_id");
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs"("entity_type", "entity_id");
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");
