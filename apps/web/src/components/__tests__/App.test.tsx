import { screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { renderWithProviders } from '../../test/test-utils';

vi.mock('../../api', () => ({
  fetchMe: vi.fn(),
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', services: { database: 'up', redis: 'up' } }),
  searchDictionary: vi.fn().mockResolvedValue([]),
  logout: vi.fn(),
}));

const { fetchMe } = await import('../../api');

describe('App', () => {
  it('renders the sign-in screen with no accessibility violations when signed out', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    const { container } = renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeInTheDocument());

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders the main nav and dictionary search when signed in, with no accessibility violations', async () => {
    vi.mocked(fetchMe).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      avatarUrl: null,
      cefrLevel: null,
    });
    const { container } = renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
