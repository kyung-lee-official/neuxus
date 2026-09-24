/*
  Warnings:

  - The primary key for the `kb_children` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `end_offset` on the `kb_children` table. All the data in the column will be lost.
  - You are about to drop the column `start_offset` on the `kb_children` table. All the data in the column will be lost.
  - The primary key for the `kb_chunk_settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `kb_chunk_settings` table. All the data in the column will be lost.
  - The primary key for the `kb_corpus_settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `kb_corpus_settings` table. All the data in the column will be lost.
  - The primary key for the `kb_image_descriptions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `content_hash` on the `kb_image_descriptions` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `kb_image_descriptions` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `kb_image_descriptions` table. All the data in the column will be lost.
  - The primary key for the `kb_pages` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `slug` on the `kb_pages` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `kb_pages` table. All the data in the column will be lost.
  - The primary key for the `kb_parents` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `end_offset` on the `kb_parents` table. All the data in the column will be lost.
  - You are about to drop the column `start_offset` on the `kb_parents` table. All the data in the column will be lost.
  - The primary key for the `kb_retrieve_settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `kb_retrieve_settings` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[knowledge_base_id,parent_id,child_index]` on the table `kb_children` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[knowledge_base_id,page_id,parent_index]` on the table `kb_parents` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `knowledge_base_id` to the `kb_children` table without a default value. This is not possible if the table is not empty.
  - Added the required column `knowledge_base_id` to the `kb_chunk_settings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `knowledge_base_id` to the `kb_corpus_settings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_content_hash` to the `kb_image_descriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `knowledge_base_id` to the `kb_image_descriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `policy` to the `kb_image_descriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `knowledge_base_id` to the `kb_pages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `knowledge_base_id` to the `kb_parents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source_page_hash` to the `kb_parents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `knowledge_base_id` to the `kb_retrieve_settings` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "kb_children" DROP CONSTRAINT "kb_children_page_id_fkey";

-- DropForeignKey
ALTER TABLE "kb_children" DROP CONSTRAINT "kb_children_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "kb_image_descriptions" DROP CONSTRAINT "kb_image_descriptions_page_id_fkey";

-- DropForeignKey
ALTER TABLE "kb_parents" DROP CONSTRAINT "kb_parents_page_id_fkey";

-- DropIndex
DROP INDEX "kb_children_parent_id_child_index_key";

-- DropIndex
DROP INDEX "kb_pages_slug_key";

-- DropIndex
DROP INDEX "kb_parents_page_id_parent_index_key";

-- AlterTable
ALTER TABLE "kb_children" DROP CONSTRAINT "kb_children_pkey",
DROP COLUMN "end_offset",
DROP COLUMN "start_offset",
ADD COLUMN     "knowledge_base_id" TEXT NOT NULL,
ADD CONSTRAINT "kb_children_pkey" PRIMARY KEY ("knowledge_base_id", "id");

-- AlterTable
ALTER TABLE "kb_chunk_settings" DROP CONSTRAINT "kb_chunk_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "knowledge_base_id" TEXT NOT NULL,
ADD CONSTRAINT "kb_chunk_settings_pkey" PRIMARY KEY ("knowledge_base_id");

-- AlterTable
ALTER TABLE "kb_corpus_settings" DROP CONSTRAINT "kb_corpus_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "knowledge_base_id" TEXT NOT NULL,
ADD CONSTRAINT "kb_corpus_settings_pkey" PRIMARY KEY ("knowledge_base_id");

-- AlterTable
ALTER TABLE "kb_image_descriptions" DROP CONSTRAINT "kb_image_descriptions_pkey",
DROP COLUMN "content_hash",
DROP COLUMN "created_at",
DROP COLUMN "updated_at",
ADD COLUMN     "caption_model" TEXT,
ADD COLUMN     "caption_prompt_hash" TEXT,
ADD COLUMN     "description_hash" TEXT,
ADD COLUMN     "embedded_at" TIMESTAMPTZ(6),
ADD COLUMN     "embedding" vector,
ADD COLUMN     "embedding_model" TEXT,
ADD COLUMN     "image_content_hash" TEXT NOT NULL,
ADD COLUMN     "knowledge_base_id" TEXT NOT NULL,
ADD COLUMN     "policy" TEXT NOT NULL,
ALTER COLUMN "description" DROP NOT NULL,
ADD CONSTRAINT "kb_image_descriptions_pkey" PRIMARY KEY ("knowledge_base_id", "page_id", "image_path");

-- AlterTable
ALTER TABLE "kb_pages" DROP CONSTRAINT "kb_pages_pkey",
DROP COLUMN "slug",
DROP COLUMN "type",
ADD COLUMN     "knowledge_base_id" TEXT NOT NULL,
ADD COLUMN     "meta_hash" TEXT,
ADD CONSTRAINT "kb_pages_pkey" PRIMARY KEY ("knowledge_base_id", "id");

-- AlterTable
ALTER TABLE "kb_parents" DROP CONSTRAINT "kb_parents_pkey",
DROP COLUMN "end_offset",
DROP COLUMN "start_offset",
ADD COLUMN     "knowledge_base_id" TEXT NOT NULL,
ADD COLUMN     "source_page_hash" TEXT NOT NULL,
ADD CONSTRAINT "kb_parents_pkey" PRIMARY KEY ("knowledge_base_id", "id");

-- AlterTable
ALTER TABLE "kb_retrieve_settings" DROP CONSTRAINT "kb_retrieve_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "knowledge_base_id" TEXT NOT NULL,
ADD CONSTRAINT "kb_retrieve_settings_pkey" PRIMARY KEY ("knowledge_base_id");

-- CreateTable
CREATE TABLE "kb_knowledge_bases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "writable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kb_children_knowledge_base_id_parent_id_child_index_key" ON "kb_children"("knowledge_base_id", "parent_id", "child_index");

-- CreateIndex
CREATE UNIQUE INDEX "kb_parents_knowledge_base_id_page_id_parent_index_key" ON "kb_parents"("knowledge_base_id", "page_id", "parent_index");

-- AddForeignKey
ALTER TABLE "kb_corpus_settings" ADD CONSTRAINT "kb_corpus_settings_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "kb_knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_chunk_settings" ADD CONSTRAINT "kb_chunk_settings_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "kb_knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_retrieve_settings" ADD CONSTRAINT "kb_retrieve_settings_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "kb_knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_pages" ADD CONSTRAINT "kb_pages_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "kb_knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_parents" ADD CONSTRAINT "kb_parents_knowledge_base_id_page_id_fkey" FOREIGN KEY ("knowledge_base_id", "page_id") REFERENCES "kb_pages"("knowledge_base_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_children" ADD CONSTRAINT "kb_children_knowledge_base_id_parent_id_fkey" FOREIGN KEY ("knowledge_base_id", "parent_id") REFERENCES "kb_parents"("knowledge_base_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_children" ADD CONSTRAINT "kb_children_knowledge_base_id_page_id_fkey" FOREIGN KEY ("knowledge_base_id", "page_id") REFERENCES "kb_pages"("knowledge_base_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_image_descriptions" ADD CONSTRAINT "kb_image_descriptions_knowledge_base_id_page_id_fkey" FOREIGN KEY ("knowledge_base_id", "page_id") REFERENCES "kb_pages"("knowledge_base_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
