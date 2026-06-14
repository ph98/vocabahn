-- Remove the unused "listening mode" distinction: ReviewLog.mode and the ReviewMode enum.
ALTER TABLE "ReviewLog" DROP COLUMN "mode";

DROP TYPE "ReviewMode";
