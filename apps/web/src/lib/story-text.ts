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
  const bySurface = new Map(targets.filter((t) => t.surfaceForm).map((t) => [t.surfaceForm, t]));
  if (bySurface.size === 0) return [{ text }];

  const alternatives = [...bySurface.keys()]
    // Longest first so a compound wins over a word nested inside it.
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  // \b is ASCII-only in JS, which breaks on umlauts and ß. Letter lookarounds
  // give the same "whole word" behaviour across the full Unicode range.
  const pattern = new RegExp(`(?<!\\p{L})(?:${alternatives.join('|')})(?!\\p{L})`, 'gu');

  const segments: StorySegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: match[0], target: bySurface.get(match[0]) });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });

  return segments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
