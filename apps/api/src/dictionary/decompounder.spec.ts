import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decomposeGermanWord } from './decompounder';
import type { PrismaService } from '../prisma/prisma.service';

describe('decomposeGermanWord', () => {
  let mockPrisma: {
    lexiconEntry: { findMany: ReturnType<typeof vi.fn> };
    wordForm: { findMany: ReturnType<typeof vi.fn> };
    dictionaryEntry: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockPrisma = {
      lexiconEntry: { findMany: vi.fn().mockResolvedValue([]) },
      wordForm: { findMany: vi.fn().mockResolvedValue([]) },
      dictionaryEntry: { findMany: vi.fn().mockResolvedValue([]) },
    };
  });

  it('returns null for short words (< 6 chars)', async () => {
    const result = await decomposeGermanWord(mockPrisma as unknown as PrismaService, 'Hund');
    expect(result).toBeNull();
    expect(mockPrisma.lexiconEntry.findMany).not.toHaveBeenCalled();
  });

  it('decomposes "Jugendhilfe" into "Jugend" (f) and "Hilfe" (f)', async () => {
    mockPrisma.lexiconEntry.findMany.mockResolvedValue([
      {
        id: 'lex-jugend',
        word: 'Jugend',
        pos: 'noun',
        gender: 'f',
        senses: [{ glosses: ['youth'], tags: [] }],
      },
      {
        id: 'lex-hilfe',
        word: 'Hilfe',
        pos: 'noun',
        gender: 'f',
        senses: [{ glosses: ['help, aid'], tags: [] }],
      },
    ]);
    mockPrisma.dictionaryEntry.findMany.mockResolvedValue([
      { word: 'Jugend', translation: 'youth' },
      { word: 'Hilfe', translation: 'help' },
    ]);

    const result = await decomposeGermanWord(mockPrisma as unknown as PrismaService, 'Jugendhilfe');

    expect(result).not.toBeNull();
    expect(result?.compound).toBe('Jugendhilfe');
    expect(result?.left.word).toBe('Jugend');
    expect(result?.left.pos).toBe('noun');
    expect(result?.right.word).toBe('Hilfe');
    expect(result?.right.pos).toBe('noun');
    expect(result?.gender).toBe('f');
    expect(result?.fugenlaut).toBeNull();
  });

  it('decomposes "Sozialverbände" with adjective modifier and inflected plural noun', async () => {
    mockPrisma.lexiconEntry.findMany.mockResolvedValue([
      {
        id: 'lex-sozial',
        word: 'sozial',
        pos: 'adj',
        gender: null,
        senses: [{ glosses: ['social'], tags: [] }],
      },
    ]);
    mockPrisma.wordForm.findMany.mockResolvedValue([
      {
        form: 'Verbände',
        tags: ['nominative', 'plural'],
        entry: {
          word: 'Verband',
          pos: 'noun',
          gender: 'm',
          senses: [{ glosses: ['association, union'], tags: [] }],
        },
      },
    ]);
    mockPrisma.dictionaryEntry.findMany.mockResolvedValue([
      { word: 'sozial', translation: 'social' },
      { word: 'Verband', translation: 'association' },
    ]);

    const result = await decomposeGermanWord(
      mockPrisma as unknown as PrismaService,
      'Sozialverbände',
    );

    expect(result).not.toBeNull();
    expect(result?.compound).toBe('Sozialverbände');
    expect(result?.left.word).toBe('sozial');
    expect(result?.left.pos).toBe('adj');
    expect(result?.right.word).toBe('Verbände');
    expect(result?.right.lemma).toBe('Verband');
    expect(result?.right.pos).toBe('noun');
    expect(result?.gender).toBe('m');
    expect(result?.formOf?.lemma).toBe('Verband');
  });

  it('detects Fugenlaut "-s-" in "Geburtstagsgeschenk"', async () => {
    mockPrisma.lexiconEntry.findMany.mockResolvedValue([
      {
        id: 'lex-geburtstag',
        word: 'Geburtstag',
        pos: 'noun',
        gender: 'm',
        senses: [{ glosses: ['birthday'], tags: [] }],
      },
      {
        id: 'lex-geschenk',
        word: 'Geschenk',
        pos: 'noun',
        gender: 'n',
        senses: [{ glosses: ['present, gift'], tags: [] }],
      },
    ]);

    const result = await decomposeGermanWord(
      mockPrisma as unknown as PrismaService,
      'Geburtstagsgeschenk',
    );

    expect(result).not.toBeNull();
    expect(result?.left.word).toBe('Geburtstag');
    expect(result?.right.word).toBe('Geschenk');
    expect(result?.fugenlaut).toBe('s');
    expect(result?.gender).toBe('n');
    expect(result?.pos).toBe('noun');
  });

  it('returns null if no valid constituent words match in lexicon', async () => {
    mockPrisma.lexiconEntry.findMany.mockResolvedValue([]);
    mockPrisma.wordForm.findMany.mockResolvedValue([]);

    const result = await decomposeGermanWord(
      mockPrisma as unknown as PrismaService,
      'Xyzqwertyuiop',
    );
    expect(result).toBeNull();
  });
});
