-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('MEANING');

-- CreateEnum
CREATE TYPE "QuizOptionOrigin" AS ENUM ('ANSWER', 'AI', 'NEIGHBOUR');

-- CreateEnum
CREATE TYPE "QuizReportReason" AS ENUM ('WRONG_ANSWER', 'AMBIGUOUS', 'TOO_EASY', 'BAD_GERMAN', 'OTHER');

-- CreateTable
CREATE TABLE "EntryQuizQuestion" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "type" "QuizQuestionType" NOT NULL DEFAULT 'MEANING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "generator" TEXT,
    "optionOrigins" "QuizOptionOrigin"[] DEFAULT ARRAY[]::"QuizOptionOrigin"[],
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "questionId" TEXT,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestionReport" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "reason" "QuizReportReason" NOT NULL,
    "comment" TEXT,
    "userAgent" TEXT,
    "locale" TEXT,
    "path" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizQuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryQuizQuestion_entryId_order_idx" ON "EntryQuizQuestion"("entryId", "order");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_entryId_idx" ON "QuizAttempt"("userId", "entryId");

-- CreateIndex
CREATE INDEX "QuizAttempt_questionId_idx" ON "QuizAttempt"("questionId");

-- CreateIndex
CREATE INDEX "QuizQuestionReport_questionId_idx" ON "QuizQuestionReport"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestionReport_questionId_userId_key" ON "QuizQuestionReport"("questionId", "userId");

-- CreateIndex
CREATE INDEX "DictionaryEntry_cefrLevel_idx" ON "DictionaryEntry"("cefrLevel");

-- AddForeignKey
ALTER TABLE "EntryQuizQuestion" ADD CONSTRAINT "EntryQuizQuestion_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EntryQuizQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestionReport" ADD CONSTRAINT "QuizQuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EntryQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestionReport" ADD CONSTRAINT "QuizQuestionReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
