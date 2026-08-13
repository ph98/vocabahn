import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('shows every bucket count and percentage without hovering', () => {
    render(<ProgressBar progress={{ learned: 20, inProgress: 30, notStarted: 50 }} />);

    const legend = screen.getByRole('list');
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Learned2020%');
    expect(items[1]).toHaveTextContent('In progress3030%');
    expect(items[2]).toHaveTextContent('Not started5050%');
  });

  it('keeps the bar aria-label accurate', () => {
    render(<ProgressBar progress={{ learned: 20, inProgress: 30, notStarted: 50 }} />);

    expect(screen.getByRole('img', { name: '20 learned, 30 in progress, 50 not started' })).toBeInTheDocument();
  });

  it('rounds percentages so they always add up to 100', () => {
    render(<ProgressBar progress={{ learned: 1, inProgress: 1, notStarted: 1 }} />);

    // 1/3 each floors to 33% — one bucket must absorb the remainder.
    const shown = screen.getAllByText(/^\d+%$/).map((el) => Number(el.textContent?.replace('%', '')));
    expect(shown).toHaveLength(3);
    expect(shown.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('shows a tooltip with bucket, count and percentage on focus, and dismisses on Escape', async () => {
    const user = userEvent.setup();
    render(<ProgressBar progress={{ learned: 20, inProgress: 30, notStarted: 50 }} />);

    expect(screen.queryByText(/Not scheduled again/)).not.toBeInTheDocument();

    const learnedTrigger = screen.getByRole('button', { name: /Learned/ });
    await user.tab();
    expect(learnedTrigger).toHaveFocus();

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Learned: 20 words (20%)');
    expect(learnedTrigger).toHaveAttribute('aria-describedby', tooltip.id);

    await user.keyboard('{Escape}');
    expect(screen.queryByText(/Not scheduled again/)).not.toBeInTheDocument();
    // Escape dismisses the tooltip without stealing focus from the trigger.
    expect(learnedTrigger).toHaveFocus();
    expect(learnedTrigger).not.toHaveAttribute('aria-describedby');
  });

  it("says where lapsed words go in the 'in progress' tooltip", async () => {
    const user = userEvent.setup();
    render(<ProgressBar progress={{ learned: 1, inProgress: 1, notStarted: 1 }} />);

    await user.hover(screen.getByRole('button', { name: /In progress/ }));

    expect(screen.getByRole('tooltip')).toHaveTextContent(/relearning/i);
  });

  it('distinguishes "no data" from "0% complete"', () => {
    const { unmount } = render(<ProgressBar progress={null} emptyLabel="Enrol to track your progress." />);
    expect(screen.getByText('Enrol to track your progress.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    unmount();

    render(<ProgressBar progress={{ learned: 0, inProgress: 0, notStarted: 40 }} />);
    expect(screen.queryByText('Enrol to track your progress.')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0 learned, 0 in progress, 40 not started' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('Not started40100%');
  });

  it('reports an empty collection rather than dividing by zero', () => {
    render(<ProgressBar progress={{ learned: 0, inProgress: 0, notStarted: 0 }} />);

    expect(screen.getByText('No words in here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ProgressBar progress={{ learned: 20, inProgress: 30, notStarted: 50 }} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
