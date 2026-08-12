-- CreateTable
CREATE TABLE "kb_chunk_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "child_target_tokens" INTEGER,
    "child_hard_max_tokens" INTEGER,
    "child_overlap_tokens" INTEGER,
    "child_crumb_min_tokens" INTEGER,
    "parent_max_tokens" INTEGER,
    "fence_intro_glue_max_tokens" INTEGER,
    "tokenizer_encoding" TEXT,

    CONSTRAINT "kb_chunk_settings_pkey" PRIMARY KEY ("id")
);
