/*
  Warnings:

  - You are about to drop the column `caption_prompt_hash` on the `kb_image_descriptions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "kb_image_descriptions" DROP COLUMN "caption_prompt_hash",
ADD COLUMN     "hardcoded_caption_prompt_hash" TEXT,
ALTER COLUMN "image_content_hash" DROP NOT NULL;
