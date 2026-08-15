import type { StoryTarget } from '@vocabahn/shared';

export interface StorySegment {
  text: string;
  /** Present when this run of text is one of the learner's studied words. */
  target?: StoryTarget;
}

/**
 * Splits a story into plain runs and tappable target words.
 *
 * Deliberately not a tokeniser: the server has already verified that every
 * `surfaceForm` occurs verbatim in `text`, so matching those exact strings is
 * enough and avoids taking a position on German compounding.
 */
export function segmentStory(text: string, targets: StoryTarget[]): StorySegment[] {
  if (!text) return [];
  const validTargets = targets.filter((t) => t.surfaceForm || t.word);
  if (validTargets.length === 0) return [{ text }];

  const bySurface = new Map<string, StoryTarget>();
  const bySurfaceLower = new Map<string, StoryTarget>();
  const byWordLower = new Map<string, StoryTarget>();

  for (const t of validTargets) {
    if (t.surfaceForm) {
      bySurface.set(t.surfaceForm, t);
      bySurfaceLower.set(t.surfaceForm.toLowerCase(), t);
    }
    if (t.word) {
      byWordLower.set(t.word.toLowerCase(), t);
    }
  }

  const keys = [...new Set([...bySurface.keys(), ...validTargets.map((t) => t.surfaceForm).filter(Boolean)])]
    // Longest first so a compound wins over a word nested inside it.
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  if (keys.length === 0) return [{ text }];

  // \b is ASCII-only in JS, which breaks on umlauts and ß. Letter lookarounds
  // give the same "whole word" behaviour across the full Unicode range.
  const pattern = new RegExp(`(?<!\\p{L})(?:${keys.join('|')})(?!\\p{L})`, 'gu');

  const segments: StorySegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    const matchedText = match[0];
    const target =
      bySurface.get(matchedText) ??
      bySurfaceLower.get(matchedText.toLowerCase()) ??
      byWordLower.get(matchedText.toLowerCase());
    segments.push({ text: matchedText, target });
    cursor = start + matchedText.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });

  return segments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
