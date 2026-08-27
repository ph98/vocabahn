/**
 * Automatically adjust and synchronize the CEFR level of each word in the dictionary
 * database to match the relevant course it belongs to, and optionally the CEFR wordlist.
 *
 * Usage:
 *   pnpm --filter @vocabahn/api sync:course-levels [--force] [--no-wordlist]
 *
 * By default:
 *   - Updates DictionaryEntry.cefrLevel for words where cefrLevel is null or mismatched based on courses.
 *   - Preserves finer sub-levels (e.g. 'A1.1', 'A1.2') if they already start with the course level (e.g. 'A1').
 *   - Syncs any remaining unassigned DictionaryEntry words from data/german_cefr_wordlist.json;
 *     pass `--no-wordlist` to skip that step.
 *   - With `--force` / `--overwrite`, forces all words in the course to exactly course.cefrLevel.
 *   - Spends 0 tokens (pure database & local dataset synchronization).
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const WORDLIST_PATH = path.resolve(__dirname, '../../../data/german_cefr_wordlist.json');

async function main() {
  const force = process.argv.includes('--force') || process.argv.includes('--overwrite');
  const skipWordlist = process.argv.includes('--no-wordlist');

  console.log('=== Synchronizing Word CEFR Levels ===');
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

  let totalUpdatedFromCourses = 0;

  if (courses.length > 0) {
    console.log('\n--- Step 1: Synchronizing from Official Courses ---');
    for (const course of courses) {
      const courseLevel = course.cefrLevel!;
      const entryIds = course.words.map((w) => w.dictionaryEntryId);

      if (entryIds.length === 0) {
        console.log(`[${course.title}] (Level: ${courseLevel}) - 0 words`);
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

      totalUpdatedFromCourses += updatedCount;
      const unchangedCount = entryIds.length - updatedCount;
      console.log(
        `[${course.title}] (Level: ${courseLevel}) - Total: ${entryIds.length} words | Updated: ${updatedCount} | Aligned: ${unchangedCount}`,
      );
    }
  } else {
    console.log('\nNo courses with a CEFR level found.');
  }

  let totalUpdatedFromWordlist = 0;
  if (!skipWordlist && existsSync(WORDLIST_PATH)) {
    console.log('\n--- Step 2: Synchronizing unassigned entries from CEFR Wordlist ---');
    const wordlist: Array<{ word: string; level: string }> = JSON.parse(readFileSync(WORDLIST_PATH, 'utf-8'));
    const validLevels = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

    // Group words by level for batch updates
    const wordsByLevel = new Map<string, string[]>();
    for (const entry of wordlist) {
      if (validLevels.has(entry.level)) {
        const list = wordsByLevel.get(entry.level) ?? [];
        list.push(entry.word);
        wordsByLevel.set(entry.level, list);
      }
    }

    for (const [level, words] of wordsByLevel.entries()) {
      const res = await prisma.dictionaryEntry.updateMany({
        where: {
          word: { in: words },
          cefrLevel: null,
        },
        data: {
          cefrLevel: level,
        },
      });
      if (res.count > 0) {
        console.log(`[Wordlist ${level}] Updated ${res.count} unassigned dictionary entries to ${level}`);
        totalUpdatedFromWordlist += res.count;
      }
    }
  }

  // Print final distribution
  console.log('\n==================================================');
  console.log('=== Final DictionaryEntry CEFR Level Distribution ===');
  const distribution = await prisma.dictionaryEntry.groupBy({
    by: ['cefrLevel'],
    _count: { _all: true },
    orderBy: { cefrLevel: 'asc' },
  });

  let totalTagged = 0;
  let totalUntagged = 0;

  for (const d of distribution) {
    const count = d._count._all;
    const label = d.cefrLevel ?? 'UNASSIGNED (NULL)';
    if (d.cefrLevel) {
      totalTagged += count;
    } else {
      totalUntagged += count;
    }
    console.log(`  ${label.padEnd(20)}: ${count}`);
  }

  console.log('--------------------------------------------------');
  console.log(`Total Classified Words : ${totalTagged}`);
  console.log(`Total Unassigned Words : ${totalUntagged}`);
  console.log(`Total Updates Performed: ${totalUpdatedFromCourses + totalUpdatedFromWordlist} (Courses: ${totalUpdatedFromCourses}, Wordlist: ${totalUpdatedFromWordlist})`);
  console.log(`Tokens Consumed        : 0 tokens (zero cost)`);
  console.log('==================================================\n');
}

main()
  .catch((e) => {
    console.error('Error during course level sync:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
