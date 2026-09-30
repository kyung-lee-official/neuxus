/*
  Warnings:

  - You are about to drop the column `description_hash` on the `kb_image_descriptions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "kb_image_descriptions" DROP COLUMN "description_hash";
