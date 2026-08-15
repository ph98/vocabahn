/**
 * Automatically adjust and synchronize the CEFR level of each word in the dictionary
 * database to match the relevant course it belongs to.
 *
 * Usage:
 *   pnpm --filter @vocabahn/api sync:course-levels [--force]
 *
 * By default:
 *   - Updates DictionaryEntry.cefrLevel for words where cefrLevel is null or mismatched.
 *   - Preserves finer sub-levels (e.g. 'A1.1', 'A1.2') if they already start with the course level (e.g. 'A1').
 *   - With `--force` / `--overwrite`, forces all words in the course to exactly course.cefrLevel.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes('--force') || process.argv.includes('--overwrite');

  console.log('=== Synchronizing Word CEFR Levels with Courses ===');
  if (force) {
    console.log('Mode: FORCE overwrite (all words will be assigned course CEFR level)');
  } else {
    console.log('Mode: Safe sync (null and mismatched levels updated; existing sub-levels preserved)');
  }

  // Find all published or active courses with a CEFR level, ordered from foundational up
  const courses = await prisma.course.findMany({
    where: {
      cefrLevel: { not: null },
    },
    orderBy: { order: 'asc' },
    include: {
      words: {
        select: {
          dictionaryEntryId: true,
          dictionaryEntry: {
            select: {
              id: true,
              word: true,
              cefrLevel: true,
            },
          },
        },
      },
    },
  });

  if (courses.length === 0) {
    console.log('No courses with a CEFR level found.');
    return;
  }

  let totalUpdated = 0;
  let totalWordsProcessed = 0;

  for (const course of courses) {
    const courseLevel = course.cefrLevel!;
    const entryIds = course.words.map((w) => w.dictionaryEntryId);
    totalWordsProcessed += entryIds.length;

    if (entryIds.length === 0) {
      console.log(`\n[${course.title}] (Level: ${courseLevel}) - 0 words`);
      continue;
    }

    let updatedCount: number;

    if (force) {
      const res = await prisma.dictionaryEntry.updateMany({
        where: {
          id: { in: entryIds },
          cefrLevel: { not: courseLevel },
        },
        data: {
          cefrLevel: courseLevel,
        },
      });
      updatedCount = res.count;
    } else {
      // Update nulls or mismatched levels
      const res = await prisma.dictionaryEntry.updateMany({
        where: {
          id: { in: entryIds },
          OR: [
            { cefrLevel: null },
            { cefrLevel: { not: { startsWith: courseLevel } } },
          ],
        },
        data: {
          cefrLevel: courseLevel,
        },
      });
      updatedCount = res.count;
    }

    totalUpdated += updatedCount;
    const unchangedCount = entryIds.length - updatedCount;
    console.log(
      `\n[${course.title}] (Level: ${courseLevel}) - Total: ${entryIds.length} words | Updated: ${updatedCount} | Unchanged/Aligned: ${unchangedCount}`,
    );
  }

  console.log('\n==================================================');
  console.log(
    `Synchronization complete: ${totalUpdated} word(s) updated out of ${totalWordsProcessed} total across ${courses.length} course(s).`,
  );
  console.log('==================================================\n');
}

main()
  .catch((e) => {
    console.error('Error during course level sync:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
