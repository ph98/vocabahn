/**
 * Re-level DictionaryEntry rows whose CEFR tag disagrees with the curated
 * wordlist in data/german_cefr_wordlist.json.
 *
 * Usage:
 *   pnpm --filter @vocabahn/api repair:cefr-levels                        # dry run
 *   pnpm --filter @vocabahn/api repair:cefr-levels --apply --demotions-only  # the repair
 *   pnpm --filter @vocabahn/api repair:cefr-levels --apply                # also fills blanks
 *
 * `--demotions-only` writes just the entries tagged *above* what the wordlist
 * says — the handful that corrupt the inference. Without it the run also fills
 * every entry that has no level at all, which is thousands of rows and is
 * really the job of `sync:course-levels`.
 *
 * Why this exists: enrichment used to let a per-word AI guess overwrite a level
 * that had been seeded from the wordlist, which tagged trivial words at absurd
 * levels — "Ich" and "Haben" as B2.1, "Du" and "Hallo" as C1.1, "Auch" as C2.2.
 * Those tags then fed the learner-level inference in `knowledge.service.ts` and
 * pinned A2 learners at B2. The processor no longer overwrites an existing
 * level; this repairs the rows written before that.
 *
 * The wordlist is the authority and is used conservatively:
 *   - A finer sub-level under the same main level is kept ('A1.2' vs 'A1').
 *   - Words the wordlist does not cover are left alone — their tag may well be
 *     right, and there is nothing better to replace it with.
 *   - Words the wordlist marks 'X' (no level assigned) are cleared to NULL.
 *
 * `data/` is not shipped in the container image, so run this from a checkout
 * with DATABASE_URL pointed at the database you mean to repair.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const WORDLIST_PATH = path.resolve(__dirname, '../../../data/german_cefr_wordlist.json');
const MAIN_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

/** 'B2.1' → 'B2'; 'B2' → 'B2'; anything unrecognised → null. */
function mainLevel(level: string | null): string | null {
  if (!level) return null;
  const main = level.slice(0, 2).toUpperCase();
  return MAIN_LEVELS.has(main) ? main : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  // The narrow repair: only pull down entries tagged above what the wordlist
  // says. This is the subset that actually corrupts the level inference, and it
  // touches a fraction of the rows a full re-level would.
  const demotionsOnly = process.argv.includes('--demotions-only');

  if (!existsSync(WORDLIST_PATH)) {
    console.error(`Wordlist not found at ${WORDLIST_PATH}. Run this from a full checkout.`);
    process.exitCode = 1;
    return;
  }

  const wordlist: Array<{ word: string; level: string }> = JSON.parse(
    readFileSync(WORDLIST_PATH, 'utf-8'),
  );

  // Lowercased, because entries are stored with their natural capitalisation
  // ("Haben") while the wordlist is lowercase throughout.
  const authority = new Map<string, string>();
  for (const { word, level } of wordlist) {
    const key = word.trim().toLowerCase();
    if (!key || authority.has(key)) continue;
    if (MAIN_LEVELS.has(level) || level === 'X') authority.set(key, level);
  }

  const entries = await prisma.dictionaryEntry.findMany({
    select: { id: true, word: true, cefrLevel: true },
  });

  const fixes: { id: string; word: string; from: string | null; to: string | null }[] = [];
  for (const entry of entries) {
    const target = authority.get(entry.word.trim().toLowerCase());
    if (!target) continue;

    if (target === 'X') {
      if (entry.cefrLevel !== null) {
        fixes.push({ id: entry.id, word: entry.word, from: entry.cefrLevel, to: null });
      }
      continue;
    }
    // A finer sub-level under the same main level is a refinement, not a
    // disagreement — 'A1.2' stays rather than being flattened back to 'A1'.
    if (mainLevel(entry.cefrLevel) === target) continue;
    fixes.push({ id: entry.id, word: entry.word, from: entry.cefrLevel, to: target });
  }

  const rank = (level: string | null) => (level ? [...MAIN_LEVELS].indexOf(mainLevel(level) ?? '') : -1);
  const fills = fixes.filter((f) => f.from === null);
  const clears = fixes.filter((f) => f.from !== null && f.to === null);
  const retags = fixes.filter((f) => f.from !== null && f.to !== null);
  const demotions = retags.filter((f) => rank(f.to) < rank(f.from));

  console.log(`${entries.length} entries scanned, ${authority.size} words covered by the wordlist.`);
  console.log(`${fixes.length} disagree with it:`);
  console.log(`  ${String(fills.length).padStart(5)} have no level at all and would be filled in`);
  console.log(`  ${String(retags.length).padStart(5)} are tagged at a different main level (${demotions.length} of them too high)`);
  console.log(`  ${String(clears.length).padStart(5)} are marked 'X' in the wordlist and would be cleared to NULL\n`);

  console.log('Tagged too high — these are what poisons the level inference:');
  for (const fix of demotions.slice(0, 30)) {
    console.log(`  ${fix.word.padEnd(24)} ${String(fix.from).padEnd(6)} → ${fix.to ?? 'NULL'}`);
  }
  if (demotions.length > 30) console.log(`  … and ${demotions.length - 30} more`);

  const selected = demotionsOnly ? demotions : fixes;

  if (!apply) {
    console.log(`\nDry run — nothing written.`);
    console.log(`  --apply                   writes all ${fixes.length} rows`);
    console.log(`  --apply --demotions-only  writes only the ${demotions.length} over-tagged rows`);
    return;
  }

  // Grouped by target level so this is a handful of updateMany calls rather
  // than one round trip per word.
  const byTarget = new Map<string | null, string[]>();
  for (const fix of selected) {
    const list = byTarget.get(fix.to) ?? [];
    list.push(fix.id);
    byTarget.set(fix.to, list);
  }

  let written = 0;
  for (const [target, ids] of byTarget) {
    const res = await prisma.dictionaryEntry.updateMany({
      where: { id: { in: ids } },
      data: { cefrLevel: target },
    });
    written += res.count;
    console.log(`  ${String(target ?? 'NULL').padEnd(6)} ← ${res.count} entries`);
  }
  console.log(`\n${written} entries re-levelled.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
