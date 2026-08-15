-- CreateTable
CREATE TABLE "StoryQuizQuestion" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "dictionaryEntryId" TEXT NOT NULL,
    "targetWord" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryQuizAttempt" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryQuizQuestion_storyId_order_idx" ON "StoryQuizQuestion"("storyId", "order");

-- CreateIndex
CREATE INDEX "StoryQuizQuestion_dictionaryEntryId_idx" ON "StoryQuizQuestion"("dictionaryEntryId");

-- CreateIndex
CREATE INDEX "StoryQuizAttempt_userId_storyId_idx" ON "StoryQuizAttempt"("userId", "storyId");

-- CreateIndex
CREATE INDEX "StoryQuizAttempt_questionId_idx" ON "StoryQuizAttempt"("questionId");

-- AddForeignKey
ALTER TABLE "StoryQuizQuestion" ADD CONSTRAINT "StoryQuizQuestion_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryQuizQuestion" ADD CONSTRAINT "StoryQuizQuestion_dictionaryEntryId_fkey" FOREIGN KEY ("dictionaryEntryId") REFERENCES "DictionaryEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryQuizAttempt" ADD CONSTRAINT "StoryQuizAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "StoryQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryQuizAttempt" ADD CONSTRAINT "StoryQuizAttempt_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryQuizAttempt" ADD CONSTRAINT "StoryQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
