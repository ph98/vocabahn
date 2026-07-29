import { screen, waitFor } from '@testing-library/react';
import type { DashboardResponse } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { DashboardPage } from '../DashboardPage';

vi.mock('../../api', () => ({
  fetchDashboard: vi.fn(),
  fetchMe: vi.fn(),
}));

const { fetchDashboard, fetchMe } = await import('../../api');

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
    vi.mocked(fetchMe).mockResolvedValue({ id: 'u1', email: 'test@example.com', name: 'Test', avatarUrl: null, cefrLevel: 'A1.1' });
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
});
