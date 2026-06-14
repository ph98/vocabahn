-- CreateEnum
CREATE TYPE "FeedbackVote" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "FeedbackIssue" AS ENUM ('LEVEL', 'TRANSLATION', 'IMAGE', 'EMOJI', 'AUDIO', 'EXAMPLE', 'GRAMMAR', 'MNEMONIC', 'OTHER');

-- CreateTable
CREATE TABLE "EntryFeedback" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "vote" "FeedbackVote",
    "issues" "FeedbackIssue"[] NOT NULL DEFAULT ARRAY[]::"FeedbackIssue"[],
    "comment" TEXT,
    "userAgent" TEXT,
    "locale" TEXT,
    "path" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryFeedback_entryId_idx" ON "EntryFeedback"("entryId");

-- CreateIndex
CREATE INDEX "EntryFeedback_vote_idx" ON "EntryFeedback"("vote");

-- CreateIndex
CREATE UNIQUE INDEX "EntryFeedback_entryId_userId_key" ON "EntryFeedback"("entryId", "userId");

-- AddForeignKey
ALTER TABLE "EntryFeedback" ADD CONSTRAINT "EntryFeedback_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryFeedback" ADD CONSTRAINT "EntryFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
