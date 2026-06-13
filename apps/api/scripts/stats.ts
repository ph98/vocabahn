/**
 * System snapshot — how data is flowing through Vocabahn (PRD §7 pipeline).
 *
 *   pnpm --filter @vocabahn/api stats
 *
 * Read-only. Safe to run any time, including while ingest/enrichment is live.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const nf = new Intl.NumberFormat('en-US');
const n = (x: number | bigint) => nf.format(x).padStart(12);

function heading(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function row(label: string, value: number | bigint, note = '') {
  console.log(`  ${label.padEnd(26)} ${n(value)}  ${note}`);
}

async function main() {
  console.log('\x1b[36m━━━ Vocabahn system snapshot ━━━\x1b[0m');
  console.log(`  ${new Date().toISOString()}`);

  // ── Lexicon layer (Wiktextract ingest) ──────────────────────────────────
  const [lexicon, forms, senses, ranked] = await Promise.all([
    prisma.lexiconEntry.count(),
    prisma.wordForm.count(),
    prisma.wordSense.count(),
    prisma.lexiconEntry.count({ where: { frequencyRank: { not: null } } }),
  ]);
  heading('Lexicon (raw Wiktextract)');
  row('Entries', lexicon);
  row('· with frequency rank', ranked, lexicon ? `${Math.round((ranked / lexicon) * 100)}%` : '');
  row('Word forms', forms, lexicon ? `~${Math.round(forms / lexicon)}/entry` : '');
  row('Word senses', senses);

  const byPos = await prisma.lexiconEntry.groupBy({
    by: ['pos'],
    _count: { _all: true },
    orderBy: { _count: { pos: 'desc' } },
    take: 6,
  });
  if (byPos.length) {
    console.log('  by part of speech:');
    for (const p of byPos) console.log(`    ${(p.pos || '∅').padEnd(22)} ${n(p._count._all)}`);
  }

  // ── Active dictionary + enrichment funnel ────────────────────────────────
  const dict = await prisma.dictionaryEntry.count();
  heading('Active dictionary (learner-facing)');
  row('Entries', dict, lexicon ? `${((dict / lexicon) * 100).toFixed(1)}% of lexicon promoted` : '');

  const byStatus = await prisma.dictionaryEntry.groupBy({
    by: ['enrichmentStatus'],
    _count: { _all: true },
  });
  const statusMap = Object.fromEntries(byStatus.map((s) => [s.enrichmentStatus, s._count._all]));
  console.log('  enrichment funnel:');
  for (const s of ['PENDING', 'ENRICHING', 'ENRICHED', 'FAILED'] as const) {
    const c = statusMap[s] ?? 0;
    const pct = dict ? `${Math.round((c / dict) * 100)}%` : '';
    const bar = '█'.repeat(dict ? Math.round((c / dict) * 20) : 0);
    console.log(`    ${s.padEnd(12)} ${n(c)}  ${pct.padStart(4)} \x1b[33m${bar}\x1b[0m`);
  }
  const [examples, images, audio] = await Promise.all([
    prisma.dictionaryExample.count(),
    prisma.dictionaryEntry.count({ where: { imageUrl: { not: null } } }),
    prisma.dictionaryEntry.count({ where: { audioUrl: { not: null } } }),
  ]);
  row('· example sentences', examples);
  row('· with image', images);
  row('· with audio', audio);

  // ── Users & study loop ───────────────────────────────────────────────────
  const [users, cards, reviews, courses, courseWords] = await Promise.all([
    prisma.user.count(),
    prisma.card.count(),
    prisma.reviewLog.count(),
    prisma.course.count(),
    prisma.courseWord.count(),
  ]);
  heading('Users & study loop');
  row('Users', users);
  row('Cards', cards);
  row('Review logs', reviews);
  row('Courses', courses, `${n(courseWords).trim()} course words`);

  // ── Sample of what the top of the dictionary looks like ──────────────────
  const top = await prisma.dictionaryEntry.findMany({
    take: 10,
    orderBy: { lexiconEntry: { frequencyRank: 'asc' } },
    select: {
      word: true,
      enrichmentStatus: true,
      lexiconEntry: { select: { pos: true, gender: true, frequencyRank: true } },
    },
  });
  if (top.length) {
    heading('Top dictionary entries by frequency');
    for (const e of top) {
      const art = { m: 'der', f: 'die', n: 'das' }[e.lexiconEntry.gender ?? ''] ?? '';
      console.log(
        `  #${String(e.lexiconEntry.frequencyRank).padStart(5)}  ${`${art} ${e.word}`.trim().padEnd(22)} ${e.lexiconEntry.pos.padEnd(6)} ${e.enrichmentStatus}`,
      );
    }
  }

  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
