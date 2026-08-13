import type { StoryTarget } from '@vocabahn/shared';
import { describe, expect, it } from 'vitest';
import { segmentStory } from '../../lib/story-text';

function target(surfaceForm: string, word = surfaceForm): StoryTarget {
  return {
    entryId: `e-${word}`,
    word,
    surfaceForm,
    translation: null,
    emoji: null,
    understood: null,
  };
}

/** Just the tappable runs, for terser assertions. */
function tapped(text: string, targets: StoryTarget[]): string[] {
  return segmentStory(text, targets)
    .filter((s) => s.target)
    .map((s) => s.text);
}

describe('segmentStory', () => {
  it('splits a target out of the surrounding text', () => {
    expect(segmentStory('Das Haus ist alt.', [target('Haus')])).toEqual([
      { text: 'Das ' },
      { text: 'Haus', target: target('Haus') },
      { text: ' ist alt.' },
    ]);
  });

  it('returns the whole text as one run when there are no targets', () => {
    expect(segmentStory('Das Haus ist alt.', [])).toEqual([{ text: 'Das Haus ist alt.' }]);
  });

  it('returns nothing for empty text', () => {
    expect(segmentStory('', [target('Haus')])).toEqual([]);
  });

  it('prefers the longest match so a compound beats the word nested in it', () => {
    // "Haus" is a substring of "Hausaufgaben" — the compound must win.
    expect(tapped('Ich mache Hausaufgaben.', [target('Haus'), target('Hausaufgaben')])).toEqual([
      'Hausaufgaben',
    ]);
  });

  it('does not match inside a longer word', () => {
    expect(tapped('Die Hausaufgaben sind fertig.', [target('Haus')])).toEqual([]);
  });

  it('treats umlauts and ß as word characters', () => {
    // \b would have matched at the "ü" boundary and split "Grüße" apart.
    expect(tapped('Grüße aus Köln.', [target('Gruß', 'Gruß')])).toEqual([]);
    expect(tapped('Die Straße ist grün.', [target('grün'), target('Straße')])).toEqual([
      'Straße',
      'grün',
    ]);
  });

  it('marks every occurrence of a repeated word', () => {
    const segments = segmentStory('Ein Haus, noch ein Haus.', [target('Haus')]);
    const hits = segments.filter((s) => s.target);
    expect(hits).toHaveLength(2);
    // Both point at the same target — one entry, two places to tap.
    expect(hits[0]?.target).toBe(hits[1]?.target);
    expect(hits[0]?.target).toBeDefined();
  });

  it('handles regex metacharacters in a surface form literally', () => {
    expect(tapped('Er sagte "c++" laut.', [target('c++')])).toEqual(['c++']);
  });

  it('keeps a target at the very start and end of the text', () => {
    expect(segmentStory('Haus', [target('Haus')])).toEqual([
      { text: 'Haus', target: target('Haus') },
    ]);
  });

  it('ignores targets with an empty surface form', () => {
    expect(segmentStory('Das Haus.', [target('')])).toEqual([{ text: 'Das Haus.' }]);
  });

  it('reassembles into exactly the original text', () => {
    const text = 'Am Montag ging Anna zur Straße. Das Haus dort war grün und alt.';
    const targets = [target('Straße'), target('Haus'), target('grün')];
    expect(
      segmentStory(text, targets)
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });
});
