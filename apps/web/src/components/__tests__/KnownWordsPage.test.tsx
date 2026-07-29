import { screen, waitFor, fireEvent } from '@testing-library/react';
import type { KnownWord } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { KnownWordsPage } from '../KnownWordsPage';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    fetchKnownWords: vi.fn(),
    fetchKnownSuggestions: vi.fn().mockResolvedValue([]),
    undoKnownWord: vi.fn().mockResolvedValue({ success: true }),
    bulkUndoKnownWords: vi.fn().mockResolvedValue({ success: true }),
  };
});

const { fetchKnownWords } = await import('../../api');

const KNOWN_WORDS: KnownWord[] = [
  {
    cardId: 'card-1',
    dictionaryEntryId: 'entry-1',
    word: 'Haus',
    translation: 'house',
    emoji: '🏠',
    cefrLevel: 'A1.1',
    reason: 'AUTO',
    score: 0.9,
    knownAt: '2026-06-14T00:00:00.000Z',
  },
  {
    cardId: 'card-2',
    dictionaryEntryId: 'entry-2',
    word: 'Katze',
    translation: 'cat',
    emoji: '🐱',
    cefrLevel: 'A1.1',
    reason: 'MANUAL',
    score: null,
    knownAt: '2026-06-15T00:00:00.000Z',
  },
];

describe('KnownWordsPage', () => {
  it('renders known words list and switches tabs with no accessibility violations', async () => {
    vi.mocked(fetchKnownWords).mockResolvedValue(KNOWN_WORDS);
    const { container } = renderWithProviders(<KnownWordsPage />);

    // Switch to Your Words tab
    fireEvent.click(screen.getByText('Your Words'));

    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
    expect(screen.getByText('Katze')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
