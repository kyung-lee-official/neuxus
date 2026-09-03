-- CreateTable
CREATE TABLE "kb_image_descriptions" (
    "page_id" TEXT NOT NULL,
    "image_path" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kb_image_descriptions_pkey" PRIMARY KEY ("page_id","image_path")
);

-- AddForeignKey
ALTER TABLE "kb_image_descriptions" ADD CONSTRAINT "kb_image_descriptions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "kb_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
