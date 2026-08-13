-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "StoryStatus" NOT NULL DEFAULT 'PENDING',
    "cefrLevel" TEXT,
    "title" TEXT,
    "text" TEXT,
    "translation" TEXT,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryTarget" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "dictionaryEntryId" TEXT NOT NULL,
    "surfaceForm" TEXT NOT NULL,
    "understood" BOOLEAN,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "StoryTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Story_userId_createdAt_idx" ON "Story"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryTarget_dictionaryEntryId_idx" ON "StoryTarget"("dictionaryEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryTarget_storyId_dictionaryEntryId_key" ON "StoryTarget"("storyId", "dictionaryEntryId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryTarget" ADD CONSTRAINT "StoryTarget_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryTarget" ADD CONSTRAINT "StoryTarget_dictionaryEntryId_fkey" FOREIGN KEY ("dictionaryEntryId") REFERENCES "DictionaryEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
