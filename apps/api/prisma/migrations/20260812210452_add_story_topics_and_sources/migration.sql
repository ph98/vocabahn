-- CreateEnum
CREATE TYPE "StoryStage" AS ENUM ('SOURCING', 'WRITING', 'NARRATING');

-- CreateEnum
CREATE TYPE "StoryOrigin" AS ENUM ('ON_DEMAND', 'DAILY');

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "origin" "StoryOrigin" NOT NULL DEFAULT 'ON_DEMAND',
ADD COLUMN     "sourceItemId" TEXT,
ADD COLUMN     "sourceName" TEXT,
ADD COLUMN     "sourcePublished" TIMESTAMP(3),
ADD COLUMN     "sourceTitle" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "stage" "StoryStage",
ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_url_key" ON "SourceItem"("url");

-- CreateIndex
CREATE INDEX "SourceItem_topic_publishedAt_idx" ON "SourceItem"("topic", "publishedAt");

-- CreateIndex
CREATE INDEX "Story_userId_sourceItemId_idx" ON "Story"("userId", "sourceItemId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
