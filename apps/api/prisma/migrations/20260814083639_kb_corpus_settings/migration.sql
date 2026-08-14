-- CreateTable
CREATE TABLE "kb_corpus_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "repo_url" TEXT,
    "branch" TEXT,
    "docs_root" TEXT,
    "last_synced_sha" TEXT,

    CONSTRAINT "kb_corpus_settings_pkey" PRIMARY KEY ("id")
);
