import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { Logo, LogoMark } from '../Logo';

describe('Logo and LogoMark', () => {
  it('renders mark only with aria-hidden', () => {
    const { container } = render(<LogoMark size="md" />);
    const div = container.firstElementChild;
    expect(div).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders full logo with Vocabahn brand text', () => {
    render(<Logo variant="full" size="md" />);
    expect(screen.getByText('Vocab')).toBeInTheDocument();
    expect(screen.getByText('ahn')).toBeInTheDocument();
  });

  it('renders optional tagline when showTagline is true', () => {
    render(<Logo variant="full" size="lg" showTagline />);
    expect(screen.getByText('German in the fast lane')).toBeInTheDocument();
  });

  it('passes axe accessibility checks without violations', async () => {
    const { container } = render(
      <a href="/" aria-label="Vocabahn Home">
        <Logo variant="full" size="md" />
      </a>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
