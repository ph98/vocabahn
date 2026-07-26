const FORM_TAGS = ['form-of', 'alt-of'];

export const isLemma = (senses: { tags: string[] }[]): boolean =>
  senses.some((s) => !s.tags.some((t) => FORM_TAGS.includes(t)));

const POS_RANK: Record<string, number> = {
  verb: 1,
  noun: 2,
  adj: 3,
  adv: 4,
  pron: 5,
  conj: 6,
  intj: 7,
  prep: 8,
};

function getPosRank(pos: string): number {
  return POS_RANK[pos] ?? 10;
}

/**
 * Compare two LexiconEntry candidates to choose which is the primary lemma.
 *
 * Rules:
 * 1. Lowercase non-nouns (e.g. "wenn" conj, "hallo" intj, "ich" pron, "du" pron)
 *    take precedence over capitalized substantivized nouns ("Wenn" noun, "Hallo" noun, "Ich" noun)
 *    unless the capitalized noun has substantially more senses (>= 3 more, e.g. "Frau" noun with 5 vs "frau" pron with 1).
 * 2. Exact case match preference if requestedWord is specified.
 * 3. Sense count (more senses is preferred).
 * 4. Balanced POS priority tie-breaker.
 */
export function compareLexiconCandidates(
  a: { word: string; pos: string; _count: { senses: number } },
  b: { word: string; pos: string; _count: { senses: number } },
  requestedWord?: string,
): number {
  const aFirstChar = a.word.charAt(0);
  const bFirstChar = b.word.charAt(0);
  const aIsLowerNonNoun = aFirstChar === aFirstChar.toLowerCase() && a.pos !== 'noun';
  const bIsLowerNonNoun = bFirstChar === bFirstChar.toLowerCase() && b.pos !== 'noun';
  const aIsCapNoun = aFirstChar === aFirstChar.toUpperCase() && a.pos === 'noun';
  const bIsCapNoun = bFirstChar === bFirstChar.toUpperCase() && b.pos === 'noun';

  // Rule 1: Lowercase non-noun vs capitalized noun preference
  if (aIsLowerNonNoun && bIsCapNoun) {
    if (b._count.senses >= a._count.senses + 3) return 1;
    return -1;
  }
  if (bIsLowerNonNoun && aIsCapNoun) {
    if (a._count.senses >= b._count.senses + 3) return -1;
    return 1;
  }

  // Rule 2: Exact case match preference if requestedWord is given
  if (requestedWord) {
    const aExact = a.word === requestedWord;
    const bExact = b.word === requestedWord;
    if (aExact && !bExact) return -1;
    if (bExact && !aExact) return 1;
  }

  // Rule 3: Compare sense count (more senses is better)
  if (b._count.senses !== a._count.senses) {
    return b._count.senses - a._count.senses;
  }

  // Rule 4: POS rank tie-breaker
  return getPosRank(a.pos) - getPosRank(b.pos);
}
