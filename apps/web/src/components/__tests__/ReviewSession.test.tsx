import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { DictionaryEntryDetail, ReviewCard } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { ReviewSession } from '../ReviewSession';

vi.mock('../../api', () => ({
  fetchDueCards: vi.fn(),
  fetchDictionaryEntry: vi.fn(),
  submitReview: vi.fn(),
  syncReviews: vi.fn(),
  // Revealing the answer renders the full EntryBody, which loads these.
  fetchFeedback: vi.fn().mockResolvedValue({ vote: null, issues: [], comment: null }),
  fetchDecks: vi.fn().mockResolvedValue({ myDecks: [] }),
  markWordKnown: vi.fn(),
  addWordToDeck: vi.fn(),
  submitFeedback: vi.fn(),
}));

const { fetchDueCards, fetchDictionaryEntry } = await import('../../api');

const CARD: ReviewCard = {
  id: 'card-1',
  due: new Date().toISOString(),
  state: 'NEW',
  reps: 0,
  lapses: 0,
  entry: {
    id: 'entry-1',
    word: 'Haus',
    pos: 'noun',
    translation: 'house',
    emoji: null,
    imageUrl: null,
    audioUrl: null,
    examples: [],
  },
};

const ENTRY_DETAIL: DictionaryEntryDetail = {
  id: 'entry-1',
  word: 'Haus',
  pos: 'noun',
  gender: 'n',
  ipa: null,
  hyphenation: null,
  etymology: null,
  frequencyRank: 10,
  translation: 'house',
  emoji: null,
  cefrLevel: 'A1',
  usageNote: null,
  collocations: [],
  falseFriends: [],
  register: null,
  mnemonic: null,
  imageUrl: null,
  audioUrl: null,
  enrichmentStatus: 'ENRICHED',
  examples: [],
  senses: [{ glosses: ['house', 'home'], tags: [], topics: [], synonyms: [], antonyms: [] }],
  forms: [],
  conjugation: null,
  nounDeclension: null,
  adjectiveDeclension: null,
  wordFamily: [],
  pronunciation: [],
  topics: [],
  formOf: null,
  imageCredit: null,
};

describe('ReviewSession', () => {
  it('shows the "all caught up" state with no accessibility violations', async () => {
    vi.mocked(fetchDueCards).mockResolvedValue([]);
    const { container } = renderWithProviders(<ReviewSession />);

    await waitFor(() => expect(screen.getByText('All caught up — nothing due right now.')).toBeInTheDocument());

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows a due flashcard with rating controls and no accessibility violations', async () => {
    vi.mocked(fetchDueCards).mockResolvedValue([CARD]);
    vi.mocked(fetchDictionaryEntry).mockResolvedValue(ENTRY_DETAIL);
    const { container } = renderWithProviders(<ReviewSession />);

    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
    // Rating controls stay hidden until the answer is revealed — one primary
    // action at a time (swipe and arrow keys still rate without revealing).
    const showAnswer = screen.getByRole('button', { name: 'Show answer' });
    expect(showAnswer).toBeInTheDocument();
    fireEvent.click(showAnswer);
    for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }

    expect(await axe(container)).toHaveNoViolations();
  });
});
