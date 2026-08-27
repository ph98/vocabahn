-- CreateEnum
CREATE TYPE "StoryFormat" AS ENUM ('TEXT', 'PODCAST');

-- CreateEnum
CREATE TYPE "PodcastSpeaker" AS ENUM ('HOST_A', 'HOST_B');

-- CreateEnum
CREATE TYPE "PodcastSegmentKind" AS ENUM ('INTRO', 'TOPIC', 'VOCAB', 'RECAP');

-- AlterTable
-- Existing stories are all readable micro-stories, so TEXT is both the default
-- and the correct backfill for every row already there.
ALTER TABLE "Story" ADD COLUMN     "format" "StoryFormat" NOT NULL DEFAULT 'TEXT';

-- CreateTable
CREATE TABLE "StorySegment" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "speaker" "PodcastSpeaker" NOT NULL,
    "kind" "PodcastSegmentKind" NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT,
    "focusWord" TEXT,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorySegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorySegment_storyId_idx" ON "StorySegment"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySegment_storyId_order_key" ON "StorySegment"("storyId", "order");

-- AddForeignKey
ALTER TABLE "StorySegment" ADD CONSTRAINT "StorySegment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
