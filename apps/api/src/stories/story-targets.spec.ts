import { describe, expect, it } from 'vitest';
import { validateTargets } from './story-targets';

const ENTRIES = [
  { id: 'e-haus', word: 'Haus' },
  { id: 'e-laufen', word: 'laufen' },
  { id: 'e-gruen', word: 'grün' },
];

describe('validateTargets', () => {
  it('keeps targets whose surface form occurs in the text', () => {
    const text = 'Das Haus ist grün. Wir laufen nach Hause.';
    expect(
      validateTargets(
        text,
        [
          { word: 'Haus', surfaceForm: 'Haus' },
          { word: 'grün', surfaceForm: 'grün' },
          { word: 'laufen', surfaceForm: 'laufen' },
        ],
        ENTRIES,
      ),
    ).toEqual([
      { entryId: 'e-haus', surfaceForm: 'Haus' },
      { entryId: 'e-gruen', surfaceForm: 'grün' },
      { entryId: 'e-laufen', surfaceForm: 'laufen' },
    ]);
  });

  it('drops a surface form the model only claims to have used', () => {
    const text = 'Das Haus ist schön.';
    const result = validateTargets(
      text,
      [
        { word: 'Haus', surfaceForm: 'Haus' },
        // The model says it conjugated "laufen", but the text has no such word.
        { word: 'laufen', surfaceForm: 'liefen' },
      ],
      ENTRIES,
    );
    expect(result).toEqual([{ entryId: 'e-haus', surfaceForm: 'Haus' }]);
  });

  it('drops headwords that were never supplied', () => {
    const result = validateTargets(
      'Der Hund schläft.',
      [{ word: 'Hund', surfaceForm: 'Hund' }],
      ENTRIES,
    );
    expect(result).toEqual([]);
  });

  it('matches headwords case-insensitively', () => {
    const result = validateTargets(
      'Ein grünes Haus.',
      [{ word: 'HAUS', surfaceForm: 'Haus' }],
      ENTRIES,
    );
    expect(result).toEqual([{ entryId: 'e-haus', surfaceForm: 'Haus' }]);
  });

  it('keeps only the first target per entry', () => {
    const text = 'Das Haus, mein Hauses.';
    const result = validateTargets(
      text,
      [
        { word: 'Haus', surfaceForm: 'Haus' },
        { word: 'Haus', surfaceForm: 'Hauses' },
      ],
      ENTRIES,
    );
    expect(result).toEqual([{ entryId: 'e-haus', surfaceForm: 'Haus' }]);
  });

  it('drops empty surface forms rather than matching everything', () => {
    // ''.includes() is always true — an unguarded check would accept this.
    const result = validateTargets('Das Haus.', [{ word: 'Haus', surfaceForm: '' }], ENTRIES);
    expect(result).toEqual([]);
  });

  it('returns an empty list when the model claims nothing', () => {
    expect(validateTargets('Das Haus.', [], ENTRIES)).toEqual([]);
  });
});
