/**
 * Select the active dictionary: top-N words by frequency that
 * have a real LEMMA lexicon entry become DictionaryEntry rows (PENDING).
 *
 *   pnpm --filter @vocabahn/api seed:dictionary [-- --top 10000] [-- --reset]
 *
 * Lemmas only: inflected/alternative forms (e.g. "Hunde" = plural of Hund,
 * "wasser" = inflection of wassern) are excluded — a lexicon entry counts as a
 * lemma only if it has at least one sense NOT tagged form-of/alt-of. Forms stay
 * in the lexicon and resolve to their lemma on lookup (DictionaryService).
 *
 * Idempotent: existing entries are kept (skipDuplicates on lexiconEntryId).
 * --reset first clears all DictionaryEntry rows and the generated audio cache.
 */
import { PrismaClient } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { AUDIO_DIR } from '../src/enrichment/providers/tts.provider';

const prisma = new PrismaClient();

import { compareLexiconCandidates } from '../src/dictionary/lexicon-ranking';

// A sense tagged with any of these is a pointer to another word, not a meaning.
const FORM_TAGS = ['form-of', 'alt-of'];

async function main() {
  const topArg = process.argv.indexOf('--top');
  const top = topArg === -1 ? 10_000 : Number(process.argv[topArg + 1]);

  if (process.argv.includes('--reset')) {
    const deleted = await prisma.dictionaryEntry.deleteMany({});
    await rm(AUDIO_DIR, { recursive: true, force: true });
    console.log(`reset: cleared ${deleted.count} dictionary entries + audio cache`);
  }

  // Top-N by frequency among words that have at least one real lemma entry.
  // Group case-insensitively by LOWER(le.word) so spelling variants are considered together.
  const words = await prisma.$queryRaw<{ word: string }[]>`
    SELECT LOWER(le.word) AS word, MIN(le."frequencyRank") AS rank
    FROM "LexiconEntry" le
    WHERE le."frequencyRank" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "WordSense" s
        WHERE s."entryId" = le.id
          AND NOT (s.tags @> ARRAY['form-of'] OR s.tags @> ARRAY['alt-of'])
      )
    GROUP BY LOWER(le.word)
    ORDER BY rank ASC
    LIMIT ${top}
  `;
  console.log(`selecting dictionary entries for top ${words.length} lemma words`);

  let created = 0;
  const CHUNK = 1000;
  for (let i = 0; i < words.length; i += CHUNK) {
    const chunk = words.slice(i, i + CHUNK).map((w) => w.word);
    const candidates = await prisma.lexiconEntry.findMany({
      // Only lemma entries: at least one sense that is not a form-of/alt-of pointer.
      where: {
        word: { in: chunk, mode: 'insensitive' },
        senses: { some: { NOT: { tags: { hasSome: FORM_TAGS } } } },
      },
      select: {
        id: true,
        word: true,
        pos: true,
        _count: { select: { senses: true } },
      },
    });

    const bestByWord = new Map<string, (typeof candidates)[number]>();
    for (const c of candidates) {
      const key = c.word.toLowerCase();
      const cur = bestByWord.get(key);
      if (!cur || compareLexiconCandidates(c, cur) < 0) {
        bestByWord.set(key, c);
      }
    }

    const result = await prisma.dictionaryEntry.createMany({
      data: [...bestByWord.values()].map((c) => ({
        lexiconEntryId: c.id,
        word: c.word,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }

  console.log(`done: ${created} dictionary entries created (pending enrichment)`);
  console.log(`total: ${await prisma.dictionaryEntry.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
