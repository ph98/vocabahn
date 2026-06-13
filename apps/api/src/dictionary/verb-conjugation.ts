import type { VerbConjugation, ConjugationMood, PersonForms } from '@vocabahn/shared';

// Maps Wiktextract person/number tags to the six finite-verb slots.
function personSlot(tags: string[]): keyof PersonForms | null {
  const singular = tags.includes('singular');
  const plural = tags.includes('plural');
  if (tags.includes('first-person')) return singular ? 'ich' : plural ? 'wir' : null;
  if (tags.includes('second-person')) return singular ? 'du' : plural ? 'ihr' : null;
  if (tags.includes('third-person')) return singular ? 'erSieEs' : plural ? 'sieSie' : null;
  return null;
}

function explicitTense(tags: string[]): keyof ConjugationMood | null {
  if (tags.includes('present')) return 'present';
  if (tags.includes('preterite')) return 'preterite';
  if (tags.includes('perfect')) return 'perfect';
  if (tags.includes('pluperfect')) return 'pluperfect';
  if (tags.includes('future-i')) return 'futureI';
  if (tags.includes('future-ii')) return 'futureII';
  return null;
}

// Konjunktiv I Präsens / Konjunktiv II Präteritum forms carry only
// subjunctive-i/-ii + person tags (no explicit tense tag) — default those.
// Perfekt/Plusquamperfekt subjunctive forms are tagged just "subjunctive":
// Konjunktiv I Perfekt is built from the present subjunctive of the auxiliary,
// Konjunktiv II Plusquamperfekt from its preterite subjunctive.
function resolveTenseAndMood(
  tags: string[],
): { tense: keyof ConjugationMood; mood: 'indicative' | 'subjunctiveI' | 'subjunctiveII' } | null {
  const tense = explicitTense(tags);
  if (tags.includes('subjunctive-i')) return { tense: tense ?? 'present', mood: 'subjunctiveI' };
  if (tags.includes('subjunctive-ii')) return { tense: tense ?? 'preterite', mood: 'subjunctiveII' };
  if (tags.includes('subjunctive')) {
    if (!tense) return null;
    return { tense, mood: tense === 'pluperfect' ? 'subjunctiveII' : 'subjunctiveI' };
  }
  if (tags.includes('indicative') && tense) return { tense, mood: 'indicative' };
  return null;
}

function mergeForm(existing: string | undefined, next: string): string {
  if (!existing) return next;
  return existing.split(' / ').includes(next) ? existing : `${existing} / ${next}`;
}

/**
 * Derives a structured conjugation table from a verb's WordForm rows, grouped
 * for tabbed display (Indikativ/Konjunktiv I/Konjunktiv II × tense × person).
 * Returns null if the lexicon entry has no systematic conjugation data.
 */
export function buildVerbConjugation(
  infinitive: string,
  forms: { form: string; tags: string[]; source: string | null }[],
): VerbConjugation | null {
  let auxiliary: string | null = null;
  let verbClass: string | null = null;
  let participlePresent: string | null = null;
  let participlePast: string | null = null;
  const indicative: ConjugationMood = {};
  const subjunctiveI: ConjugationMood = {};
  const subjunctiveII: ConjugationMood = {};
  const imperative: PersonForms = {};
  const alternativeForms: string[] = [];
  let found = false;

  for (const f of forms) {
    const tags = f.tags;
    if (tags.includes('auxiliary')) {
      auxiliary = f.form;
      continue;
    }
    if (tags.includes('participle')) {
      if (tags.includes('present')) participlePresent = f.form;
      else if (tags.includes('past')) participlePast = f.form;
      continue;
    }
    if (tags.includes('alternative')) {
      alternativeForms.push(f.form);
      continue;
    }
    if (f.source !== 'conjugation') continue;
    if (tags.includes('class')) {
      verbClass = f.form;
      continue;
    }
    if (tags.includes('imperative')) {
      const slot = personSlot(tags);
      if (slot) {
        imperative[slot] = mergeForm(imperative[slot], f.form);
        found = true;
      }
      continue;
    }

    const slot = personSlot(tags);
    const resolved = resolveTenseAndMood(tags);
    if (!slot || !resolved) continue;
    const { tense, mood } = resolved;

    const moodObj =
      mood === 'indicative' ? indicative : mood === 'subjunctiveI' ? subjunctiveI : subjunctiveII;
    const tenseObj = moodObj[tense] ?? (moodObj[tense] = {});
    tenseObj[slot] = mergeForm(tenseObj[slot], f.form);
    found = true;
  }

  if (!found) return null;

  return {
    infinitive,
    auxiliary,
    class: verbClass,
    participlePresent,
    participlePast,
    indicative,
    subjunctiveI,
    subjunctiveII,
    imperative,
    alternativeForms,
  };
}
