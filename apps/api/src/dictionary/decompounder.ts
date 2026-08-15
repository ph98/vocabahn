import type { CompoundComponent, CompoundDecomposition } from '@vocabahn/shared';
import type { PrismaService } from '../prisma/prisma.service';

const FUGEN = ['s', 'es', 'en', 'n', 'e', 'er'];

function cleanInflectionGloss(gloss: string | null): string | null {
  if (!gloss) return null;
  const pluralMatch = gloss.match(/(?:(?:nominative|accusative|dative|genitive|\/|\s)+)?plural of ([^\s.,;]+)/i);
  if (pluralMatch) {
    return `plural of ${pluralMatch[1]}`;
  }
  const singularMatch = gloss.match(/(?:(?:nominative|accusative|dative|genitive|\/|\s)+)?singular of ([^\s.,;]+)/i);
  if (singularMatch) {
    return `singular of ${singularMatch[1]}`;
  }
  return gloss;
}

/**
 * Decomposes a German compound word (Kompositum) like "Jugendhilfe" (Jugend + Hilfe)
 * or "Sozialverbände" (sozial + Verbände [Verband]) into its constituent words.
 *
 * German Compounding Rules:
 * 1. The last word (Grundwort / head) determines the part of speech, grammatical gender,
 *    and declension/plural forms of the compound.
 * 2. Preceding elements (Bestimmungswort / modifier) can be nouns, adjectives, or verb stems,
 *    often linked with a Fugenlaut (-s-, -es-, -en-, -n-, -e-, -er-).
 */
export async function decomposeGermanWord(
  prisma: PrismaService,
  compound: string,
): Promise<CompoundDecomposition | null> {
  const trimmed = compound.trim();
  const len = trimmed.length;
  if (len < 6) return null;

  const isCapitalized = /^[A-ZÄÖÜ]/.test(trimmed);

  // 1. Gather all potential substring splits
  const splits: { leftRaw: string; leftCandidates: string[]; right: string }[] = [];
  const allSubstrings = new Set<string>();

  for (let i = 3; i <= len - 3; i++) {
    const leftRaw = trimmed.slice(0, i);
    const right = trimmed.slice(i);
    const leftCandidates = [leftRaw];
    allSubstrings.add(leftRaw.toLowerCase());
    allSubstrings.add(right.toLowerCase());

    for (const f of FUGEN) {
      if (leftRaw.toLowerCase().endsWith(f) && leftRaw.length - f.length >= 3) {
        const stripped = leftRaw.slice(0, -f.length);
        leftCandidates.push(stripped);
        allSubstrings.add(stripped.toLowerCase());
      }
    }
    splits.push({ leftRaw, leftCandidates, right });
  }

  // 2. Fetch all matching LexiconEntry, WordForm, and DictionaryEntry rows in parallel
  const subArr = Array.from(allSubstrings);
  const [lexEntries, wordForms, dictEntries] = await Promise.all([
    prisma.lexiconEntry?.findMany
      ? prisma.lexiconEntry.findMany({
          where: { word: { in: subArr, mode: 'insensitive' } },
          select: {
            id: true,
            word: true,
            pos: true,
            gender: true,
            senses: { select: { glosses: true, tags: true }, orderBy: { order: 'asc' } },
          },
        })
      : Promise.resolve([]),
    prisma.wordForm?.findMany
      ? prisma.wordForm.findMany({
          where: { form: { in: subArr, mode: 'insensitive' } },
          select: {
            form: true,
            tags: true,
            entry: {
              select: {
                word: true,
                pos: true,
                gender: true,
                senses: { select: { glosses: true, tags: true }, orderBy: { order: 'asc' }, take: 1 },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.dictionaryEntry?.findMany
      ? prisma.dictionaryEntry.findMany({
          where: { word: { in: subArr, mode: 'insensitive' } },
          select: { word: true, translation: true },
        })
      : Promise.resolve([]),
  ]);

  const transMap = new Map<string, string>();
  for (const d of dictEntries) {
    if (d.translation) {
      transMap.set(d.word.toLowerCase(), d.translation);
    }
  }

  // Group candidate matches by lowercase word
  const candidatesByWord = new Map<string, CompoundComponent[]>();

  const addCandidate = (key: string, comp: CompoundComponent) => {
    const lower = key.toLowerCase();
    const list = candidatesByWord.get(lower) || [];
    list.push(comp);
    candidatesByWord.set(lower, list);
  };

  // 1) Add Lemma Lexicon Entries
  for (const l of lexEntries) {
    const firstSense =
      l.senses.find((s) => !s.tags.some((t) => ['form-of', 'alt-of'].includes(t))) || l.senses[0];
    const gloss = cleanInflectionGloss(firstSense?.glosses[0] || null);
    const translation = transMap.get(l.word.toLowerCase()) || null;
    addCandidate(l.word, {
      word: l.word,
      lemma: l.word,
      pos: l.pos,
      gender: l.gender,
      gloss,
      translation,
    });
  }

  // 2) Add WordForm inflections
  for (const f of wordForms) {
    if (f.entry) {
      const gloss = cleanInflectionGloss(f.entry.senses[0]?.glosses[0] || null);
      const translation =
        transMap.get(f.form.toLowerCase()) ||
        transMap.get(f.entry.word.toLowerCase()) ||
        null;
      addCandidate(f.form, {
        word: f.form,
        lemma: f.entry.word,
        pos: f.entry.pos,
        gender: f.entry.gender,
        gloss,
        translation,
      });
    }
  }

  // 3. Score combinations
  let bestCandidate: CompoundDecomposition | null = null;
  let bestScore = -Infinity;

  for (const split of splits) {
    const rightCandidates = candidatesByWord.get(split.right.toLowerCase()) || [];
    if (rightCandidates.length === 0) continue;

    for (const leftCand of split.leftCandidates) {
      const leftCandidates = candidatesByWord.get(leftCand.toLowerCase()) || [];
      if (leftCandidates.length === 0) continue;

      for (const left of leftCandidates) {
        for (const right of rightCandidates) {
          let score = 0;

          // For capitalized compound (German noun), head word is almost always a noun
          if (isCapitalized) {
            if (right.pos === 'noun') score += 20;
            else if (right.pos === 'verb') score -= 15;
            else if (right.pos === 'adj') score -= 5;
          }

          // Left modifier preferences: noun, adj, verb
          if (left.pos === 'noun') score += 10;
          else if (left.pos === 'adj') score += 8;
          else if (left.pos === 'verb') score += 5;
          else score -= 5;

          // Prefer lemmas over obscure inflected forms for left
          if (left.word.toLowerCase() === left.lemma.toLowerCase()) score += 4;

          // Exact matching without Fugenlaut or standard Fugen-s
          if (leftCand === split.leftRaw) score += 3;
          else if (split.leftRaw.slice(leftCand.length) === 's') score += 3;
          else if (split.leftRaw.slice(leftCand.length) === 'en') score += 2;

          // If component has translation in active dictionary, boost confidence
          if (right.translation) score += 4;
          if (left.translation) score += 3;

          // Length balance
          score += Math.min(left.word.length, right.word.length);

          if (score > bestScore) {
            bestScore = score;
            const isInflected = right.word.toLowerCase() !== right.lemma.toLowerCase();
            bestCandidate = {
              compound: trimmed,
              left,
              right,
              fugenlaut: leftCand !== split.leftRaw ? split.leftRaw.slice(leftCand.length) : null,
              gender: right.gender,
              pos: right.pos,
              formOf: isInflected
                ? {
                    lemma: right.lemma,
                    description: `Form of ${right.lemma}`,
                  }
                : null,
            };
          }
        }
      }
    }
  }

  return bestCandidate;
}
