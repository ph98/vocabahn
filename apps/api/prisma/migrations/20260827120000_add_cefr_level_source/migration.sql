-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cefrLevelSource" TEXT,
ADD COLUMN     "cefrLevelSetAt" TIMESTAMP(3);

-- Existing rows predate provenance tracking. Anything already set was written
-- by the inference or an early calibration, so leaving both columns NULL is
-- accurate: NULL source means "unprotected", which is the pre-change behaviour.
