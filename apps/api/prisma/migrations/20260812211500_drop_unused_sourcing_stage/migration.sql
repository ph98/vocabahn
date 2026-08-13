-- Source selection happens synchronously when a Story row is created, so no
-- learner ever waits in a SOURCING stage and no row was ever written with it.
-- Postgres cannot drop an enum value in place, so the type is recreated.
ALTER TYPE "StoryStage" RENAME TO "StoryStage_old";
CREATE TYPE "StoryStage" AS ENUM ('WRITING', 'NARRATING');
ALTER TABLE "Story" ALTER COLUMN "stage" TYPE "StoryStage" USING ("stage"::text::"StoryStage");
DROP TYPE "StoryStage_old";
