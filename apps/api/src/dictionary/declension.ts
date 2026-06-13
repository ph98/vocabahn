import type { AdjectiveDeclension, NounDeclension } from '@vocabahn/shared';

const CASES = ['nominative', 'genitive', 'dative', 'accusative'] as const;
type Case = (typeof CASES)[number];

/**
 * Derives a singular/plural × case table for a noun from its WordForm rows.
 * Nominative singular is always the lemma itself (by definition); accusative
 * singular defaults to nominative singular unless data overrides it (weak
 * nouns like "Löwe" → "Löwen"). Returns null if no declension data exists.
 */
export function buildNounDeclension(
  lemma: string,
  forms: { form: string; tags: string[]; source: string | null }[],
): NounDeclension | null {
  const table = new Map<string, string>();
  let found = false;

  // Two passes so plain forms (e.g. "Hunde" dative singular) take priority
  // over "definite"-tagged variants (e.g. archaic "dem Hunde").
  for (const wantDefinite of [false, true]) {
    for (const f of forms) {
      if (f.source !== 'declension') continue;
      const tags = f.tags;
      if (tags.includes('nonstandard') || tags.includes('error-unknown-tag')) continue;
      if (tags.includes('definite') !== wantDefinite) continue;

      const caseKey = CASES.find((c) => tags.includes(c));
      const number = tags.includes('plural') ? 'plural' : tags.includes('singular') ? 'singular' : null;
      if (!caseKey || !number) continue;

      const key = `${number}.${caseKey}`;
      if (!table.has(key)) {
        table.set(key, f.form);
        found = true;
      }
    }
  }

  if (!found) return null;

  const singular: Partial<Record<Case, string>> = { nominative: lemma };
  const plural: Partial<Record<Case, string>> = {};
  for (const c of CASES) {
    const sg = table.get(`singular.${c}`);
    if (sg) singular[c] = sg;
    const pl = table.get(`plural.${c}`);
    if (pl) plural[c] = pl;
  }
  if (!singular.accusative) singular.accusative = singular.nominative;

  return { singular, plural };
}

type Degree = 'positive' | 'comparative' | 'superlative';
type Strength = 'strong' | 'weak' | 'mixed';

/**
 * Derives positive/comparative/superlative declension tables (strong, weak,
 * mixed endings + predicative form) for an adjective from its WordForm rows.
 * Returns null if no declension data exists.
 */
export function buildAdjectiveDeclension(
  lemma: string,
  forms: { form: string; tags: string[]; source: string | null }[],
): AdjectiveDeclension | null {
  const degrees: Record<
    Degree,
    { strong: Record<string, Record<string, string>>; weak: Record<string, Record<string, string>>; mixed: Record<string, Record<string, string>>; predicative: string | null }
  > = {
    positive: { strong: {}, weak: {}, mixed: {}, predicative: lemma },
    comparative: { strong: {}, weak: {}, mixed: {}, predicative: null },
    superlative: { strong: {}, weak: {}, mixed: {}, predicative: null },
  };
  let comparativeFound = false;
  let superlativeFound = false;
  let found = false;

  for (const f of forms) {
    if (f.source !== 'declension') continue;
    const tags = f.tags;
    if (tags.includes('negative') || tags.includes('nonstandard') || tags.includes('error-unknown-tag')) continue;

    const degree: Degree = tags.includes('superlative')
      ? 'superlative'
      : tags.includes('comparative')
        ? 'comparative'
        : 'positive';
    if (degree === 'comparative') comparativeFound = true;
    if (degree === 'superlative') superlativeFound = true;

    if (tags.includes('predicative')) {
      degrees[degree].predicative = f.form;
      found = true;
      continue;
    }

    const strength: Strength | null = tags.includes('strong')
      ? 'strong'
      : tags.includes('weak')
        ? 'weak'
        : tags.includes('mixed')
          ? 'mixed'
          : null;
    if (!strength) continue;

    const caseKey = CASES.find((c) => tags.includes(c));
    if (!caseKey) continue;

    const slot = tags.includes('masculine')
      ? 'masculine'
      : tags.includes('feminine')
        ? 'feminine'
        : tags.includes('neuter')
          ? 'neuter'
          : tags.includes('plural')
            ? 'plural'
            : null;
    if (!slot) continue;

    const table = degrees[degree][strength];
    const caseTable = table[caseKey] ?? (table[caseKey] = {});
    if (!caseTable[slot]) caseTable[slot] = f.form;
    found = true;
  }

  if (!found) return null;

  return {
    positive: degrees.positive as AdjectiveDeclension['positive'],
    comparative: comparativeFound ? (degrees.comparative as AdjectiveDeclension['comparative']) : null,
    superlative: superlativeFound ? (degrees.superlative as AdjectiveDeclension['superlative']) : null,
  };
}
