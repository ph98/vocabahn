/**
 * Create one published course per CEFR level (A1–C2) from data/german_cefr_wordlist.json.
 *
 *   pnpm --filter @vocabahn/api seed:cefr-courses
 *
 * Idempotent: upserts courses and skips existing CourseWords.
 * Words in the file that don't yet have a DictionaryEntry are skipped with a warning.
 * Words labelled 'X' (no level assigned) are ignored.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

const DATA_FILE = path.resolve(__dirname, '../../../data/german_cefr_wordlist.json');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Level = (typeof LEVELS)[number];

const COURSE_META: Record<Level, { title: string; description: string; order: number; isComplete: boolean }> = {
  A1: { title: 'CEFR A1 — Beginner',          description: 'Essential vocabulary for absolute beginners.',                   order: 1, isComplete: true },
  A2: { title: 'CEFR A2 — Elementary',         description: 'Core vocabulary for everyday elementary communication.',         order: 2, isComplete: true },
  B1: { title: 'CEFR B1 — Intermediate',       description: 'Vocabulary for independent communication in German.',            order: 3, isComplete: true },
  B2: { title: 'CEFR B2 — Upper-Intermediate', description: 'Expanded vocabulary for upper-intermediate proficiency.',        order: 4, isComplete: true },
  C1: { title: 'CEFR C1 — Advanced',           description: 'Sophisticated vocabulary for advanced German speakers. (Incomplete dataset)', order: 5, isComplete: false },
  C2: { title: 'CEFR C2 — Mastery',            description: 'Near-native vocabulary for German mastery. (Incomplete dataset)',            order: 6, isComplete: false },
};

async function main() {
  const wordlist: Array<{ word: string; rate: number; level: string; rank: number }> =
    JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

  // Group by level, preserving CEFR rank order within each level
  const byLevel = new Map<Level, string[]>();
  for (const level of LEVELS) byLevel.set(level, []);

  for (const entry of wordlist) {
    if (!LEVELS.includes(entry.level as Level)) continue;
    byLevel.get(entry.level as Level)!.push(entry.word);
  }

  for (const level of LEVELS) {
    const words = byLevel.get(level)!;
    const meta = COURSE_META[level];
    const slug = `cefr-${level.toLowerCase()}`;

    console.log(`\n[${level}] ${words.length} words in source list`);

    // Fetch all DictionaryEntries whose LexiconEntry.word appears in this level
    const matched = await prisma.dictionaryEntry.findMany({
      where: { lexiconEntry: { word: { in: words } } },
      select: {
        id: true,
        lexiconEntry: { select: { word: true, frequencyRank: true } },
      },
      orderBy: { lexiconEntry: { frequencyRank: 'asc' } },
    });

    // One entry per word — lowest frequency rank wins (most common)
    const seen = new Set<string>();
    const deduplicated = matched.filter(e => {
      const w = e.lexiconEntry.word;
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });

    // Preserve the CEFR list order rather than pure frequency order
    const cefrOrder = new Map(words.map((w, i) => [w, i]));
    deduplicated.sort((a, b) => {
      const oa = cefrOrder.get(a.lexiconEntry.word) ?? Infinity;
      const ob = cefrOrder.get(b.lexiconEntry.word) ?? Infinity;
      return oa - ob;
    });

    const unmatched = words.filter(w => !seen.has(w));
    if (unmatched.length) {
      console.log(`  skipped ${unmatched.length} words not yet in dictionary`);
    }
    console.log(`  matched ${deduplicated.length} dictionary entries`);

    const course = await prisma.course.upsert({
      where: { slug },
      create: {
        slug,
        title: meta.title,
        description: meta.description,
        cefrLevel: level,
        order: meta.order,
        published: true,
        isComplete: meta.isComplete,
      },
      update: {
        title: meta.title,
        description: meta.description,
        cefrLevel: level,
        order: meta.order,
        published: true,
        isComplete: meta.isComplete,
      },
    });

    const { count } = await prisma.courseWord.createMany({
      data: deduplicated.map((e, i) => ({
        courseId: course.id,
        dictionaryEntryId: e.id,
        order: i,
      })),
      skipDuplicates: true,
    });

    const entryIds = deduplicated.map((e) => e.id);
    const updatedEntries = await prisma.dictionaryEntry.updateMany({
      where: {
        id: { in: entryIds },
        OR: [
          { cefrLevel: null },
          { cefrLevel: { not: { startsWith: level } } },
        ],
      },
      data: {
        cefrLevel: level,
      },
    });

    console.log(`  done: ${count} course words added to "${slug}" (${updatedEntries.count} entry CEFR levels synchronized)`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
