/*
  Warnings:

  - You are about to drop the column `embedded_description_hash` on the `kb_image_descriptions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "kb_image_descriptions" DROP COLUMN "embedded_description_hash",
ADD COLUMN     "embed_input_hash" TEXT;
