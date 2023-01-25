/*
  Warnings:

  - Added the required column `updatedAt` to the `StarCount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StarCount" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Data Update
UPDATE "StarCount" SET "updatedAt" = CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "StarCount" ALTER COLUMN "updatedAt" SET NOT NULL;
