import { screen, waitFor } from '@testing-library/react';
import type { DictionaryEntryDetail } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { EntryBody } from '../DictionaryCard';

vi.mock('../../api', () => ({
  fetchFeedback: vi.fn().mockResolvedValue({ vote: null, issues: [], comment: null }),
  submitFeedback: vi.fn(),
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
});
