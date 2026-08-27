import { screen, waitFor } from '@testing-library/react';
import type { DashboardResponse } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { DashboardPage } from '../DashboardPage';

vi.mock('../../api', () => ({
  fetchDashboard: vi.fn(),
  fetchMe: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    avatarUrl: null,
    cefrLevel: 'A1.1',
    interests: [],
  }),
  // The dashboard surfaces a story waiting; nothing is waiting by default.
  fetchLatestStory: vi.fn().mockResolvedValue(null),
}));

const { fetchDashboard, fetchMe, fetchLatestStory } = await import('../../api');

const DASHBOARD: DashboardResponse = {
  streak: 5,
  heatmap: [
    { date: '2026-06-12', count: 0 },
    { date: '2026-06-13', count: 3 },
    { date: '2026-06-14', count: 7 },
  ],
  stats: { dueToday: 2, reviewedToday: 7, totalKnown: 40, totalLearning: 12, totalNew: 5 },
  courses: [
    {
      id: 'course-1',
      slug: 'a1-basics',
      title: 'A1 Basics',
      description: null,
      cefrLevel: 'A1',
      order: 0,
      isComplete: true,
      wordCount: 100,
      enrolled: true,
      progress: { learned: 20, inProgress: 30, notStarted: 50 },
    },
  ],
};

describe('DashboardPage', () => {
  it('renders stats, heatmap, and an accessible activity list with no a11y violations', async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(DASHBOARD);
    vi.mocked(fetchMe).mockResolvedValue({ id: 'u1', email: 'test@example.com', name: 'Test', avatarUrl: null, cefrLevel: 'A1.1', interests: [] });
    const { container } = renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('day streak')).toBeInTheDocument());

    const list = screen.getByText('View activity as a list');
    expect(list.closest('details')).not.toBeNull();
    // The heatmap SVG is hidden from assistive tech; the list is the
    // accessible alternative and should include the non-zero days.
    const d1 = new Date('2026-06-13').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const d2 = new Date('2026-06-14').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    expect(screen.getByText(d1)).toBeInTheDocument();
    expect(screen.getByText(d2)).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  describe("today's read", () => {
    const WAITING_STORY = {
      id: 'story-1',
      status: 'READY' as const,
      stage: null,
      origin: 'DAILY' as const,
      topic: 'football',
      source: {
        title: 'PSG schafft den Supercup-Doppelpack',
        url: 'https://www.kicker.de/psg-1242244/artikel',
        name: 'kicker',
        publishedAt: '2026-08-12T20:55:54.000Z',
      },
      cefrLevel: 'A2.1',
      title: 'Ein grüner Tag',
      text: 'Das Haus ist grün.',
      translation: 'The house is green.',
      audioUrl: null,
      image: null,
      error: null,
      completedAt: null,
      createdAt: '2026-08-12T05:00:00.000Z',
      targets: [],
      format: 'TEXT' as const,
      segments: [],
    };

    it('links to a scheduled story so the learner can find it', async () => {
      // Until push notifications exist, this card is the only thing that tells
      // a learner the scheduler wrote them something overnight.
      vi.mocked(fetchDashboard).mockResolvedValue(DASHBOARD);
      vi.mocked(fetchLatestStory).mockResolvedValue(WAITING_STORY);

      renderWithProviders(<DashboardPage />);

      const link = await screen.findByRole('link', { name: /Today's read/ });
      expect(link).toHaveAttribute('href', '/story');
      expect(screen.getByText('Ein grüner Tag')).toBeInTheDocument();
      expect(screen.getByText('Football · via kicker')).toBeInTheDocument();
    });

    it('shows nothing when no story is waiting', async () => {
      vi.mocked(fetchDashboard).mockResolvedValue(DASHBOARD);
      vi.mocked(fetchLatestStory).mockResolvedValue(null);

      renderWithProviders(<DashboardPage />);

      await waitFor(() => expect(screen.getByText('day streak')).toBeInTheDocument());
      expect(screen.queryByText("Today's read")).not.toBeInTheDocument();
    });

    it('does not advertise a story that failed to generate', async () => {
      vi.mocked(fetchDashboard).mockResolvedValue(DASHBOARD);
      vi.mocked(fetchLatestStory).mockResolvedValue({
        ...WAITING_STORY,
        status: 'FAILED',
        text: null,
      });

      renderWithProviders(<DashboardPage />);

      await waitFor(() => expect(screen.getByText('day streak')).toBeInTheDocument());
      expect(screen.queryByRole('link', { name: /Today's read/ })).not.toBeInTheDocument();
    });
  });
});
