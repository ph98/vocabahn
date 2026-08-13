import { screen, waitFor } from '@testing-library/react';
import type { DeckListResponse } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { DecksPage } from '../DecksPage';

vi.mock('../../api', () => ({
  fetchDecks: vi.fn(),
  createDeck: vi.fn(),
  deleteDeck: vi.fn(),
}));

const { fetchDecks } = await import('../../api');

const DECKS: DeckListResponse = {
  myDecks: [
    {
      id: 'deck-1',
      title: 'Travel Vocab',
      description: 'Useful words for trip',
      isPublic: false,
      wordCount: 15,
      progress: { learned: 6, inProgress: 3, notStarted: 6 },
      ownerName: 'Test User',
      isOwner: true,
      createdAt: new Date().toISOString(),
    },
  ],
  publicDecks: [
    {
      id: 'deck-2',
      title: 'Food & Drinks',
      description: 'Public community deck',
      isPublic: true,
      wordCount: 30,
      progress: { learned: 0, inProgress: 0, notStarted: 30 },
      ownerName: 'Other User',
      isOwner: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('DecksPage', () => {
  it('renders decks with review action buttons and no accessibility violations', async () => {
    vi.mocked(fetchDecks).mockResolvedValue(DECKS);
    const { container } = renderWithProviders(<DecksPage />);

    await waitFor(() => expect(screen.getByText('Travel Vocab')).toBeInTheDocument());
    expect(screen.getByText('Food & Drinks')).toBeInTheDocument();

    const reviewLinks = screen.getAllByRole('link', { name: 'Review' });
    expect(reviewLinks).toHaveLength(2);
    expect(reviewLinks[0]).toHaveAttribute('href', '/review?deckId=deck-1');

    // Progress comes straight from the server payload, not from anything computed here.
    expect(screen.getByRole('img', { name: '6 learned, 3 in progress, 6 not started' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0 learned, 0 in progress, 30 not started' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
