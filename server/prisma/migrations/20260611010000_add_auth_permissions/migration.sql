CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

ALTER TABLE "rag_documents"
ADD COLUMN "owner_id" TEXT,
ADD COLUMN "access_level" TEXT NOT NULL DEFAULT 'private';

ALTER TABLE "conversations"
ADD COLUMN "owner_id" TEXT;

CREATE INDEX "rag_documents_owner_id_idx" ON "rag_documents"("owner_id");
CREATE INDEX "rag_documents_access_level_idx" ON "rag_documents"("access_level");
CREATE INDEX "conversations_owner_id_idx" ON "conversations"("owner_id");

ALTER TABLE "rag_documents"
ADD CONSTRAINT "rag_documents_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
