-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'ENRICHING', 'ENRICHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImageSource" AS ENUM ('UNSPLASH', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "KnownState" AS ENUM ('ACTIVE', 'AUTO_KNOWN', 'USER_KNOWN', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FsrsState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "ReviewRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('STANDARD', 'LISTENING');

-- CreateTable
CREATE TABLE "LexiconEntry" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "gender" TEXT,
    "ipa" TEXT,
    "hyphenation" TEXT,
    "etymology" TEXT,
    "etymologyNumber" INTEGER,
    "frequencyRank" INTEGER,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexiconEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordForm" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "tags" TEXT[],
    "source" TEXT,

    CONSTRAINT "WordForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordSense" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "glosses" TEXT[],
    "tags" TEXT[],
    "topics" TEXT[],
    "synonyms" TEXT[],
    "antonyms" TEXT[],

    CONSTRAINT "WordSense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryEntry" (
    "id" TEXT NOT NULL,
    "lexiconEntryId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "translation" TEXT,
    "emoji" TEXT,
    "cefrLevel" TEXT,
    "imageUrl" TEXT,
    "imageSource" "ImageSource",
    "audioUrl" TEXT,
    "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "enrichmentError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryExample" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "de" TEXT NOT NULL,
    "en" TEXT NOT NULL,

    CONSTRAINT "DictionaryExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageCredit" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUrl" TEXT,
    "sourceUrl" TEXT,

    CONSTRAINT "ImageCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dictionaryEntryId" TEXT NOT NULL,
    "knownState" "KnownState" NOT NULL DEFAULT 'ACTIVE',
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduledDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" "FsrsState" NOT NULL DEFAULT 'NEW',
    "lastReview" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "ReviewRating" NOT NULL,
    "mode" "ReviewMode" NOT NULL DEFAULT 'STANDARD',
    "latencyMs" INTEGER,
    "state" "FsrsState" NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "elapsedDays" DOUBLE PRECISION NOT NULL,
    "scheduledDays" DOUBLE PRECISION NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dictionaryEntryId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "components" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cefrLevel" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseWord" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dictionaryEntryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CourseWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCourse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LexiconEntry_word_idx" ON "LexiconEntry"("word");

-- CreateIndex
CREATE INDEX "LexiconEntry_frequencyRank_idx" ON "LexiconEntry"("frequencyRank");

-- CreateIndex
CREATE INDEX "LexiconEntry_pos_idx" ON "LexiconEntry"("pos");

-- CreateIndex
CREATE INDEX "WordForm_entryId_idx" ON "WordForm"("entryId");

-- CreateIndex
CREATE INDEX "WordForm_form_idx" ON "WordForm"("form");

-- CreateIndex
CREATE INDEX "WordSense_entryId_idx" ON "WordSense"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryEntry_lexiconEntryId_key" ON "DictionaryEntry"("lexiconEntryId");

-- CreateIndex
CREATE INDEX "DictionaryEntry_word_idx" ON "DictionaryEntry"("word");

-- CreateIndex
CREATE INDEX "DictionaryEntry_enrichmentStatus_idx" ON "DictionaryEntry"("enrichmentStatus");

-- CreateIndex
CREATE INDEX "DictionaryExample_entryId_idx" ON "DictionaryExample"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageCredit_entryId_key" ON "ImageCredit"("entryId");

-- CreateIndex
CREATE INDEX "Card_userId_due_idx" ON "Card"("userId", "due");

-- CreateIndex
CREATE INDEX "Card_userId_knownState_idx" ON "Card"("userId", "knownState");

-- CreateIndex
CREATE UNIQUE INDEX "Card_userId_dictionaryEntryId_key" ON "Card"("userId", "dictionaryEntryId");

-- CreateIndex
CREATE INDEX "ReviewLog_cardId_reviewedAt_idx" ON "ReviewLog"("cardId", "reviewedAt");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_reviewedAt_idx" ON "ReviewLog"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "KnowledgeScore_userId_score_idx" ON "KnowledgeScore"("userId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeScore_userId_dictionaryEntryId_key" ON "KnowledgeScore"("userId", "dictionaryEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "CourseWord_courseId_order_idx" ON "CourseWord"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CourseWord_courseId_dictionaryEntryId_key" ON "CourseWord"("courseId", "dictionaryEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCourse_userId_courseId_key" ON "UserCourse"("userId", "courseId");

-- AddForeignKey
ALTER TABLE "WordForm" ADD CONSTRAINT "WordForm_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LexiconEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordSense" ADD CONSTRAINT "WordSense_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LexiconEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryEntry" ADD CONSTRAINT "DictionaryEntry_lexiconEntryId_fkey" FOREIGN KEY ("lexiconEntryId") REFERENCES "LexiconEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryExample" ADD CONSTRAINT "DictionaryExample_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageCredit" ADD CONSTRAINT "ImageCredit_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_dictionaryEntryId_fkey" FOREIGN KEY ("dictionaryEntryId") REFERENCES "DictionaryEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeScore" ADD CONSTRAINT "KnowledgeScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseWord" ADD CONSTRAINT "CourseWord_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseWord" ADD CONSTRAINT "CourseWord_dictionaryEntryId_fkey" FOREIGN KEY ("dictionaryEntryId") REFERENCES "DictionaryEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
