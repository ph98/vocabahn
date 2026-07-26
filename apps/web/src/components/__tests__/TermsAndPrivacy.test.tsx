import { screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { TermsPage } from '../TermsPage';
import { PrivacyPage } from '../PrivacyPage';
import { renderWithProviders } from '../../test/test-utils';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    fetchMe: vi.fn(),
    fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', services: { database: 'up', redis: 'up' } }),
  };
});

const { fetchMe } = await import('../../api');

describe('Terms & Privacy Pages', () => {
  it('renders TermsPage with heading and no accessibility violations', async () => {
    const { container } = renderWithProviders(<TermsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders PrivacyPage with heading and no accessibility violations', async () => {
    const { container } = renderWithProviders(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders Terms of Service via /terms route for unauthenticated user', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);

    renderWithProviders(<App />, { route: '/terms' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    });
  });

  it('renders Privacy Policy via /privacy route for unauthenticated user', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);

    renderWithProviders(<App />, { route: '/privacy' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    });
  });
});
