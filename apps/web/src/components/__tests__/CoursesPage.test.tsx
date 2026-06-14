import { screen, waitFor } from '@testing-library/react';
import type { CourseSummary } from '@vocabahn/shared';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { CoursesPage } from '../CoursesPage';

vi.mock('../../api', () => ({
  fetchCourses: vi.fn(),
  enrollCourse: vi.fn(),
}));

const { fetchCourses } = await import('../../api');

const COURSES: CourseSummary[] = [
  {
    id: 'course-1',
    slug: 'a1-basics',
    title: 'A1 Basics',
    description: 'Foundational vocabulary',
    cefrLevel: 'A1',
    order: 0,
    wordCount: 100,
    enrolled: true,
    progress: { learned: 20, inProgress: 30, notStarted: 50 },
  },
  {
    id: 'course-2',
    slug: 'a2-everyday',
    title: 'A2 Everyday',
    description: null,
    cefrLevel: 'A2',
    order: 1,
    wordCount: 50,
    enrolled: false,
    progress: null,
  },
];

describe('CoursesPage', () => {
  it('renders course cards with no accessibility violations', async () => {
    vi.mocked(fetchCourses).mockResolvedValue(COURSES);
    const { container } = renderWithProviders(<CoursesPage />);

    await waitFor(() => expect(screen.getByText('A1 Basics')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enroll' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
