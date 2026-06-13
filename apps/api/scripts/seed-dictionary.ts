/**
 * Select the active dictionary (PRD §7 step 3): top-N words by frequency that
 * have a lexicon entry become DictionaryEntry rows with enrichmentStatus=PENDING.
 *
 *   pnpm --filter @vocabahn/api seed:dictionary [-- --top 10000]
 *
 * Idempotent: existing entries are kept (skipDuplicates on lexiconEntryId).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// When a word has several lexicon records (POS/etymologies), the dictionary
// entry is layered on the most useful one: content words first, then most senses.
const POS_PRIORITY = ['noun', 'verb', 'adj', 'adv'];

function posRank(pos: string): number {
  const i = POS_PRIORITY.indexOf(pos);
  return i === -1 ? POS_PRIORITY.length : i;
}

async function main() {
  const topArg = process.argv.indexOf('--top');
  const top = topArg === -1 ? 10_000 : Number(process.argv[topArg + 1]);

  const words = await prisma.$queryRaw<{ word: string }[]>`
    SELECT word, MIN("frequencyRank") AS rank
    FROM "LexiconEntry"
    WHERE "frequencyRank" IS NOT NULL
    GROUP BY word
    ORDER BY rank ASC
    LIMIT ${top}
  `;
  console.log(`selecting dictionary entries for top ${words.length} words`);

  let created = 0;
  const CHUNK = 1000;
  for (let i = 0; i < words.length; i += CHUNK) {
    const chunk = words.slice(i, i + CHUNK).map((w) => w.word);
    const candidates = await prisma.lexiconEntry.findMany({
      where: { word: { in: chunk } },
      select: {
        id: true,
        word: true,
        pos: true,
        _count: { select: { senses: true } },
      },
    });

    const bestByWord = new Map<string, (typeof candidates)[number]>();
    for (const c of candidates) {
      const cur = bestByWord.get(c.word);
      if (
        !cur ||
        posRank(c.pos) < posRank(cur.pos) ||
        (posRank(c.pos) === posRank(cur.pos) && c._count.senses > cur._count.senses)
      ) {
        bestByWord.set(c.word, c);
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
