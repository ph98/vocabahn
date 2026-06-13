-- AlterTable
ALTER TABLE "DictionaryEntry" ADD COLUMN     "collocations" JSONB,
ADD COLUMN     "falseFriends" JSONB,
ADD COLUMN     "mnemonic" TEXT,
ADD COLUMN     "register" TEXT;
