import type { PronunciationVariant, WordFamilyEntry } from '@vocabahn/shared';

interface RawRelatedWord {
  word?: string;
}

interface RawSound {
  ipa?: string;
  note?: string;
  rhymes?: string;
  mp3_url?: string;
}

interface RawCategory {
  name?: string;
}

interface RawSense {
  categories?: RawCategory[];
}

interface RawEntry {
  derived?: RawRelatedWord[];
  related?: RawRelatedWord[];
  sounds?: RawSound[];
  senses?: RawSense[];
}

/**
 * Single-word relatives (derived terms + related terms) — the morphological
 * "word family". Multi-word phrases/idioms are left for the AI learner aids.
 */
export function buildWordFamily(raw: unknown, limit = 15): WordFamilyEntry[] {
  const r = raw as RawEntry;
  const words = new Set<string>();
  for (const item of [...(r.derived ?? []), ...(r.related ?? [])]) {
    const word = item.word;
    if (word && !word.includes(' ')) words.add(word);
  }
  return [...words]
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, limit)
    .map((word) => ({ word }));
}

/** IPA/audio variants plus rhyme keys from Wiktextract's `sounds` array. */
export function buildPronunciation(raw: unknown): PronunciationVariant[] {
  const r = raw as RawEntry;
  return (r.sounds ?? [])
    .filter((s) => s.ipa || s.mp3_url)
    .map((s) => ({
      ipa: s.ipa ?? null,
      note: s.note ?? null,
      audioUrl: s.mp3_url ?? null,
    }));
}

// Wiktionary's generic/meta categories aren't useful topic labels.
const META_CATEGORY = /^(Pages|German )/i;
const META_SUBSTRING = /entries|etymon/i;

/** Topical/domain categories (e.g. "Cooking", "Dogs") from the entry's senses. */
export function buildTopics(raw: unknown, limit = 8): string[] {
  const r = raw as RawEntry;
  const topics = new Set<string>();
  for (const sense of r.senses ?? []) {
    for (const cat of sense.categories ?? []) {
      const name = cat.name;
      if (name && !META_CATEGORY.test(name) && !META_SUBSTRING.test(name)) {
        topics.add(name);
      }
    }
  }
  return [...topics].slice(0, limit);
}
