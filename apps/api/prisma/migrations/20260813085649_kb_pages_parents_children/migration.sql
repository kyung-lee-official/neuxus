-- CreateTable
CREATE TABLE "kb_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "body" TEXT NOT NULL,
    "source_path" TEXT,
    "content_hash" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_parents" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "parent_index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "start_offset" INTEGER,
    "end_offset" INTEGER,

    CONSTRAINT "kb_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_children" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "child_index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "start_offset" INTEGER,
    "end_offset" INTEGER,
    "embedding" vector,
    "embedding_model" TEXT,
    "embedded_at" TIMESTAMPTZ(6),

    CONSTRAINT "kb_children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kb_pages_slug_key" ON "kb_pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "kb_parents_page_id_parent_index_key" ON "kb_parents"("page_id", "parent_index");

-- CreateIndex
CREATE UNIQUE INDEX "kb_children_parent_id_child_index_key" ON "kb_children"("parent_id", "child_index");

-- AddForeignKey
ALTER TABLE "kb_parents" ADD CONSTRAINT "kb_parents_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "kb_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_children" ADD CONSTRAINT "kb_children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "kb_parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_children" ADD CONSTRAINT "kb_children_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "kb_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
