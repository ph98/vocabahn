import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { DictionaryEntryDetail, ReviewCard } from '@vocabahn/shared';
import { IDBFactory } from 'fake-indexeddb';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { ReviewSession } from '../ReviewSession';

vi.mock('../../api', () => ({
  fetchDueCards: vi.fn(),
  fetchDictionaryEntry: vi.fn(),
  submitReview: vi.fn(),
  syncReviews: vi.fn(),
  undoLastReview: vi.fn(),
  // Revealing the answer renders the full EntryBody, which loads these.
  fetchFeedback: vi.fn().mockResolvedValue({ vote: null, issues: [], comment: null }),
  fetchDecks: vi.fn().mockResolvedValue({ myDecks: [] }),
  markWordKnown: vi.fn(),
  addWordToDeck: vi.fn(),
  submitFeedback: vi.fn(),
}));

// Analytics is gated off in test mode, so the real module can never prove what
// a session sends. Mocking it makes the calls themselves assertable.
vi.mock('../../lib/telemetry', () => ({
  trackEvent: vi.fn(),
  isFirstReviewSession: vi.fn(() => false),
}));

const { fetchDueCards, fetchDictionaryEntry, submitReview, syncReviews, undoLastReview } = await import('../../api');
const { trackEvent, isFirstReviewSession } = await import('../../lib/telemetry');
const { getQueueCount, getQueuedReviews } = await import('../../offline/queue');

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

const SECOND_CARD: ReviewCard = {
  ...CARD,
  id: 'card-2',
  entry: { ...CARD.entry, id: 'entry-2', word: 'Baum', translation: 'tree' },
};

const THIRD_CARD: ReviewCard = {
  ...CARD,
  id: 'card-3',
  entry: { ...CARD.entry, id: 'entry-3', word: 'Katze', translation: 'cat' },
};

/**
 * GSAP flies the rated card off-screen and only then advances; forcing
 * reduced motion makes rating synchronous so tests don't race an animation.
 */
function forceReducedMotion() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
}

/** Reveals the current card and rates it. */
function rate(label: 'Again' | 'Hard' | 'Good' | 'Easy') {
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: label }));
}

/** Waits for the undo control to settle (it is disabled while a request is in flight) and clicks it. */
async function clickUndo() {
  const button = await screen.findByRole('button', { name: 'Undo last rating' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

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

describe('ReviewSession undo', () => {
  beforeEach(() => {
    // Each test gets its own offline queue — it is module-level global state.
    vi.clearAllMocks();
    globalThis.indexedDB = new IDBFactory();
    forceReducedMotion();
    setOnline(true);
    vi.mocked(fetchDueCards).mockResolvedValue([CARD, SECOND_CARD]);
    // The session merges the fetched detail over the card, so the detail has to
    // belong to the word actually asked for.
    vi.mocked(fetchDictionaryEntry).mockImplementation((word: string) =>
      Promise.resolve({ ...ENTRY_DETAIL, id: `entry-${word}`, word }),
    );
    vi.mocked(submitReview).mockResolvedValue({ card: CARD, autoGraduated: null });
    vi.mocked(undoLastReview).mockResolvedValue({ card: CARD, undoneRating: 'GOOD', revertedGraduation: false });
    vi.mocked(syncReviews).mockResolvedValue(0);
  });

  it('offers no undo before anything has been rated', async () => {
    renderWithProviders(<ReviewSession />);

    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Undo last rating' })).not.toBeInTheDocument();
  });

  it('returns to the rated card, unrevealed, and rolls the review back on the server', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    await clickUndo();

    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    // Back to the unrevealed front, ready to be re-rated.
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
    await waitFor(() => expect(undoLastReview).toHaveBeenCalledWith('card-1'));
  });

  it('undoes only the last rating — the control disappears once used', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await clickUndo();

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo last rating' })).not.toBeInTheDocument());
    expect(undoLastReview).toHaveBeenCalledTimes(1);
  });

  it('takes the auto-marked-as-known banner back down when that rating is undone', async () => {
    vi.mocked(submitReview).mockResolvedValue({ card: CARD, autoGraduated: { count: 1, words: ['Haus'] } });
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Easy');
    expect(await screen.findByText('1 word auto-marked as known')).toBeInTheDocument();

    await clickUndo();

    await waitFor(() => expect(screen.queryByText(/auto-marked as known/)).not.toBeInTheDocument());
  });

  it('undoes on the "u" keyboard shortcut', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Easy');
    await screen.findByRole('button', { name: 'Undo last rating' });
    fireEvent.keyDown(window, { key: 'u' });

    await waitFor(() => expect(undoLastReview).toHaveBeenCalledWith('card-1'));
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
  });

  it('keeps the summary tally to the reviews that actually stuck', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
    rate('Again');
    await waitFor(() => expect(screen.getByLabelText('Session summary')).toBeInTheDocument());

    // Undo is still offered on the summary screen for the final card.
    await clickUndo();
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
    rate('Easy');

    await screen.findByLabelText('Session summary');
    // The undone "Again" is not counted; the replacement "Easy" is.
    const tally = (label: string) => screen.getByText(label, { selector: 'p' }).previousElementSibling?.textContent;
    expect([tally('Again'), tally('Hard'), tally('Good'), tally('Easy')]).toEqual(['0', '0', '1', '1']);
  });

  it('drops an offline rating from the sync queue instead of calling the API', async () => {
    setOnline(false);
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await waitFor(async () => expect(await getQueueCount()).toBe(1));

    await clickUndo();
    await waitFor(async () => expect(await getQueueCount()).toBe(0));
    expect(undoLastReview).not.toHaveBeenCalled();
    expect(await getQueuedReviews()).toEqual([]);
  });

  it('does not resurrect an undone offline rating when the connection returns', async () => {
    setOnline(false);
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await waitFor(async () => expect(await getQueueCount()).toBe(1));
    await clickUndo();
    await waitFor(async () => expect(await getQueueCount()).toBe(0));

    setOnline(true);
    fireEvent(window, new Event('online'));

    await waitFor(() => expect(screen.queryByText(/queued/)).not.toBeInTheDocument());
    expect(syncReviews).not.toHaveBeenCalled();
    expect(undoLastReview).not.toHaveBeenCalled();
  });

  it('has no accessibility violations with the undo control shown', async () => {
    const { container } = renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await screen.findByRole('button', { name: 'Undo last rating' });

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ReviewSession analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.indexedDB = new IDBFactory();
    forceReducedMotion();
    setOnline(true);
    vi.mocked(isFirstReviewSession).mockReturnValue(false);
    vi.mocked(fetchDueCards).mockResolvedValue([CARD, SECOND_CARD, THIRD_CARD]);
    vi.mocked(fetchDictionaryEntry).mockImplementation((word: string) =>
      Promise.resolve({ ...ENTRY_DETAIL, id: `entry-${word}`, word }),
    );
    vi.mocked(submitReview).mockResolvedValue({ card: CARD, autoGraduated: null });
    vi.mocked(undoLastReview).mockResolvedValue({ card: CARD, undoneRating: 'GOOD', revertedGraduation: false });
    vi.mocked(syncReviews).mockResolvedValue(0);
  });

  /** Every event the component sent, as [name, params] pairs. */
  const sentEvents = () => vi.mocked(trackEvent).mock.calls.map((call) => [call[0], call[1]]);

  it('sends one aggregated summary for a whole session, never an event per card', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
    rate('Again');
    await waitFor(() => expect(screen.getByText('Katze')).toBeInTheDocument());
    rate('Easy');
    await screen.findByLabelText('Session summary');

    // Three cards rated, one event. This is the acceptance criterion: a
    // 50-card session must not produce 50 hits.
    expect(sentEvents()).toHaveLength(1);
    const [name, params] = sentEvents()[0]!;
    expect(name).toBe('review_session_complete');
    expect(params).toMatchObject({
      card_count: 3,
      again_count: 1,
      hard_count: 0,
      good_count: 1,
      easy_count: 1,
      accuracy_pct: 67,
      offline_queued_count: 0,
      session_scope: 'all',
    });
  });

  it('does not send a second summary when a rating is undone from the summary and redone', async () => {
    vi.mocked(fetchDueCards).mockResolvedValue([CARD]);
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await screen.findByLabelText('Session summary');
    await clickUndo();
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
    rate('Again');
    await screen.findByLabelText('Session summary');

    expect(sentEvents().filter(([name]) => name === 'review_session_complete')).toHaveLength(1);
  });

  it('adds first_review_complete the first time a session is finished on this device', async () => {
    vi.mocked(isFirstReviewSession).mockReturnValue(true);
    vi.mocked(fetchDueCards).mockResolvedValue([CARD]);
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await screen.findByLabelText('Session summary');

    expect(sentEvents()).toEqual([
      ['review_session_complete', expect.objectContaining({ card_count: 1 })],
      ['first_review_complete', { card_count: 1 }],
    ]);
  });

  it('reports a session left half-finished as an abandon, not a completion', async () => {
    const { unmount } = renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
    unmount();

    expect(sentEvents()).toEqual([
      ['review_session_abandon', { card_count: 1, remaining_count: 2, session_scope: 'all' }],
    ]);
  });

  it('says nothing about a session nobody rated a card in', async () => {
    const { unmount } = renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
    unmount();

    expect(sentEvents()).toEqual([]);
  });

  it('counts offline ratings on the summary instead of sending one event each', async () => {
    setOnline(false);
    vi.mocked(fetchDueCards).mockResolvedValue([CARD, SECOND_CARD]);
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
    rate('Good');
    await screen.findByLabelText('Session summary');

    expect(sentEvents()).toHaveLength(1);
    expect(sentEvents()[0]![1]).toMatchObject({ card_count: 2, offline_queued_count: 2 });
  });

  it('scopes a deck session so the deck id never has to be sent', async () => {
    vi.mocked(fetchDueCards).mockResolvedValue([CARD]);
    renderWithProviders(<ReviewSession />, { route: '/review?deckId=deck-1' });
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    rate('Good');
    await screen.findByLabelText('Session summary');

    expect(sentEvents()[0]![1]).toMatchObject({ session_scope: 'deck' });
    expect(JSON.stringify(sentEvents())).not.toContain('deck-1');
  });
});

describe('ReviewSession keyboard navigation & shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.indexedDB = new IDBFactory();
    forceReducedMotion();
    setOnline(true);
    vi.mocked(fetchDueCards).mockResolvedValue([CARD, SECOND_CARD]);
    vi.mocked(fetchDictionaryEntry).mockImplementation((word: string) =>
      Promise.resolve({ ...ENTRY_DETAIL, id: `entry-${word}`, word, gender: 'n', cefrLevel: 'A1' }),
    );
    vi.mocked(submitReview).mockResolvedValue({ card: CARD, autoGraduated: null });
    vi.mocked(undoLastReview).mockResolvedValue({ card: CARD, undoneRating: 'GOOD', revertedGraduation: false });
    vi.mocked(syncReviews).mockResolvedValue(0);
  });

  it('reveals answer on Space key and rates with number keys 1-4', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    // Press Space to reveal
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument());

    // Press '3' to rate Good
    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    await waitFor(() => expect(submitReview).toHaveBeenCalledWith('card-1', expect.objectContaining({ rating: 'GOOD' })));
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
  });

  it('rates with arrow keys', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    // Rate Again directly with ArrowLeft
    fireEvent.keyDown(window, { key: 'ArrowLeft', code: 'ArrowLeft' });
    await waitFor(() => expect(submitReview).toHaveBeenCalledWith('card-1', expect.objectContaining({ rating: 'AGAIN' })));
    await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
  });

  it('opens and closes the keyboard shortcuts modal', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    // Open with '?' button
    const shortcutsBtn = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    fireEvent.click(shortcutsBtn);

    expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Reveal card answer')).toBeInTheDocument();

    // Close with Escape key
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).not.toBeInTheDocument();
  });

  it('renders gender article and CEFR badges when available', async () => {
    renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    // Reveal to load detail with gender 'n' and CEFR 'A1'
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    await waitFor(() => {
      expect(screen.getAllByText('das').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('A1').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders flashcard within a contained scroll container', async () => {
    const { container } = renderWithProviders(<ReviewSession />);
    await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());

    const scroller = container.querySelector('.vb-card-scroll');
    expect(scroller).toBeInTheDocument();
    expect(scroller).toHaveClass('overflow-y-auto');
  });
});


