-- CreateTable
CREATE TABLE "kb_retrieve_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "child_limit" INTEGER,
    "max_parents" INTEGER,
    "max_characters" INTEGER,

    CONSTRAINT "kb_retrieve_settings_pkey" PRIMARY KEY ("id")
);
