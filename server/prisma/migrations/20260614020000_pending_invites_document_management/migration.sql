CREATE TABLE "team_invites" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "invited_by_id" TEXT,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_invites_team_id_email_key" ON "team_invites"("team_id", "email");
CREATE INDEX "team_invites_email_idx" ON "team_invites"("email");
CREATE INDEX "team_invites_team_id_idx" ON "team_invites"("team_id");

ALTER TABLE "team_invites"
  ADD CONSTRAINT "team_invites_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rag_documents"
  ADD COLUMN "original_name" TEXT,
  ADD COLUMN "stored_path" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "renamed_at" TIMESTAMP(3);
