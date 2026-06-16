-- CreateTable
CREATE TABLE "UserDeck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDeckWord" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "dictionaryEntryId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDeckWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDeck_userId_idx" ON "UserDeck"("userId");

-- CreateIndex
CREATE INDEX "UserDeck_isPublic_idx" ON "UserDeck"("isPublic");

-- CreateIndex
CREATE INDEX "UserDeckWord_deckId_addedAt_idx" ON "UserDeckWord"("deckId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDeckWord_deckId_dictionaryEntryId_key" ON "UserDeckWord"("deckId", "dictionaryEntryId");

-- AddForeignKey
ALTER TABLE "UserDeck" ADD CONSTRAINT "UserDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeckWord" ADD CONSTRAINT "UserDeckWord_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "UserDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeckWord" ADD CONSTRAINT "UserDeckWord_dictionaryEntryId_fkey" FOREIGN KEY ("dictionaryEntryId") REFERENCES "DictionaryEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
