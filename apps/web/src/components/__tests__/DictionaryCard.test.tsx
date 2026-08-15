import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { DictionaryEntryDetail } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { AudioButton, EntryBody } from '../DictionaryCard';

vi.mock('../../api', () => ({
  fetchFeedback: vi.fn().mockResolvedValue({ vote: null, issues: [], comment: null }),
  submitFeedback: vi.fn(),
  fetchDecks: vi.fn().mockResolvedValue({ myDecks: [] }),
  fetchEntryQuiz: vi.fn().mockResolvedValue({
    status: 'ENRICHED',
    questions: [
      {
        id: 'q1',
        type: 'MEANING',
        prompt: 'What does “laufen” mean?',
        options: ['to run', 'to sleep', 'to buy', 'to sing'],
      },
    ],
  }),
  submitQuizAttempt: vi.fn(),
  reportQuizQuestion: vi.fn(),
}));

const ENTRY: DictionaryEntryDetail = {
  id: 'entry-1',
  word: 'laufen',
  pos: 'verb',
  gender: null,
  ipa: 'ˈlaʊfn̩',
  hyphenation: 'lau-fen',
  etymology: 'From Old High German loufan.',
  frequencyRank: 120,
  translation: 'to run, to walk',
  emoji: '🏃',
  cefrLevel: 'A1',
  usageNote: 'Used for both walking and running depending on context.',
  collocations: [{ phrase: 'laufen lassen', translation: 'to let go' }],
  falseFriends: [],
  register: null,
  mnemonic: null,
  imageUrl: null,
  audioUrl: null,
  enrichmentStatus: 'ENRICHED',
  examples: [{ de: 'Ich laufe jeden Tag.', en: 'I run every day.', audioUrl: null }],
  senses: [{ glosses: ['to run', 'to walk'], tags: [], topics: [], synonyms: ['rennen'], antonyms: [] }],
  forms: [{ form: 'läuft', tags: ['3rd person singular present'] }],
  conjugation: null,
  nounDeclension: null,
  adjectiveDeclension: null,
  wordFamily: [{ word: 'Lauf' }],
  pronunciation: [],
  topics: [],
  formOf: null,
  imageCredit: null,
};

describe('EntryBody', () => {
  it('renders the tabbed entry view with no accessibility violations', async () => {
    const { container } = renderWithProviders(<EntryBody entry={ENTRY} onSelectWord={() => {}} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: /laufen/ })).toBeInTheDocument());

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Family', 'Tips', 'Details']);
    // Only the active tab should be in the tab order; others use roving tabindex.
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    expect(tabs[0]).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('switches tabs via arrow keys and updates aria-selected', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    renderWithProviders(<EntryBody entry={ENTRY} onSelectWord={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('tab')[0]).toBeInTheDocument());

    const user = userEvent.setup();
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');

    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('adds a keyboard-reachable Quiz tab when the word page opts in', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const { container } = renderWithProviders(
      <EntryBody entry={ENTRY} onSelectWord={() => {}} showQuiz />,
    );
    await waitFor(() => expect(screen.getAllByRole('tab')[0]).toBeInTheDocument());

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Overview',
      'Quiz',
      'Family',
      'Tips',
      'Details',
    ]);

    const user = userEvent.setup();
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');

    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('What does “laufen” mean?')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('leaves the review session embed without a quiz tab', async () => {
    renderWithProviders(<EntryBody entry={ENTRY} onSelectWord={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('tab')[0]).toBeInTheDocument());

    expect(screen.queryByRole('tab', { name: 'Quiz' })).not.toBeInTheDocument();
  });
});

describe('AudioButton', () => {
  it('renders normal active state', () => {
    renderWithProviders(<AudioButton src="/api/static/audio/test.mp3" label="Pronounce laufen" />);

    const btn = screen.getByRole('button', { name: 'Pronounce laufen' });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent('🔊');
  });

  it('handles media 404/loading error gracefully', async () => {
    const { container } = renderWithProviders(
      <AudioButton src="/api/static/audio/missing.mp3" label="Pronounce laufen" />,
    );

    const audioElement = container.querySelector('audio')!;
    expect(audioElement).toBeInTheDocument();

    // Trigger media load error (e.g. 404)
    fireEvent.error(audioElement);

    await waitFor(() => {
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent('🔇');
      expect(btn).toHaveAttribute('aria-label', 'Pronounce laufen (Audio unavailable)');
      expect(btn).toHaveAttribute('title', 'Audio unavailable');
    });
  });

  it('renders compound word breakdown when entry.compound is present', async () => {
    const onSelectWord = vi.fn();
    const COMPOUND_ENTRY: DictionaryEntryDetail = {
      ...ENTRY,
      word: 'Jugendhilfe',
      gender: 'f',
      pos: 'noun',
      compound: {
        compound: 'Jugendhilfe',
        left: {
          word: 'Jugend',
          lemma: 'Jugend',
          pos: 'noun',
          gender: 'f',
          gloss: 'youth',
          translation: 'youth',
        },
        right: {
          word: 'Hilfe',
          lemma: 'Hilfe',
          pos: 'noun',
          gender: 'f',
          gloss: 'help',
          translation: 'help',
        },
        fugenlaut: null,
        gender: 'f',
        pos: 'noun',
      },
    };

    renderWithProviders(<EntryBody entry={COMPOUND_ENTRY} onSelectWord={onSelectWord} />);

    await waitFor(() => expect(screen.getByText(/Compound Word Breakdown/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Jugend/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hilfe/ })).toBeInTheDocument();
    expect(screen.getByText(/die \(feminine\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Jugend/ }));
    expect(onSelectWord).toHaveBeenCalledWith('Jugend', 'noun');
  });
});


// Unsplash's API guidelines require the photographer to be credited with links
// back to their profile and to Unsplash, each carrying UTM parameters naming
// the application. The story banner renders through the same component.
describe('Unsplash attribution', () => {
  const WITH_IMAGE: DictionaryEntryDetail = {
    ...ENTRY,
    imageUrl: 'https://images.unsplash.com/photo-1',
    imageCredit: { authorName: 'Ada Fotograf', authorUrl: 'https://unsplash.com/@ada' },
  };

  it('credits the photographer with referral parameters on both links', async () => {
    const { container } = renderWithProviders(
      <EntryBody entry={WITH_IMAGE} onSelectWord={() => {}} />,
    );

    const author = await screen.findByRole('link', { name: 'Ada Fotograf' });
    expect(author).toHaveAttribute(
      'href',
      'https://unsplash.com/@ada?utm_source=vocabahn&utm_medium=referral',
    );
    expect(screen.getByRole('link', { name: 'Unsplash' })).toHaveAttribute(
      'href',
      'https://unsplash.com?utm_source=vocabahn&utm_medium=referral',
    );
    expect(author).toHaveAttribute('rel', 'noopener noreferrer');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('still names the photographer when their profile link is missing', async () => {
    renderWithProviders(
      <EntryBody
        entry={{ ...WITH_IMAGE, imageCredit: { authorName: 'Ada Fotograf', authorUrl: null } }}
        onSelectWord={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText(/Ada Fotograf/)).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Ada Fotograf' })).not.toBeInTheDocument();
    // The link back to Unsplash itself is required whether or not the profile
    // link is known.
    expect(screen.getByRole('link', { name: 'Unsplash' })).toBeInTheDocument();
  });
});
