CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "rag_documents" (
  "id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'indexed',
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rag_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rag_chunks" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "embedding" vector NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "page" INTEGER,
  "source" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rag_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sources" JSONB,
  "usage" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rag_chunks_document_id_idx" ON "rag_chunks"("document_id");
CREATE INDEX "rag_chunks_chunk_index_idx" ON "rag_chunks"("chunk_index");
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

ALTER TABLE "rag_chunks"
ADD CONSTRAINT "rag_chunks_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "rag_documents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
ADD CONSTRAINT "messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
