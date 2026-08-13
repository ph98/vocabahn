import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { EntryQuizSection } from '../EntryQuiz';

const { fetchEntryQuiz, submitQuizAttempt, reportQuizQuestion } = vi.hoisted(() => ({
  fetchEntryQuiz: vi.fn(),
  submitQuizAttempt: vi.fn(),
  reportQuizQuestion: vi.fn(),
}));

vi.mock('../../api', () => ({ fetchEntryQuiz, submitQuizAttempt, reportQuizQuestion }));

/**
 * Asserts `text` is announced politely. The app shell mounts a `ToastProvider`
 * whose (usually empty) region is also `role="status"`, so a bare
 * `getByRole('status')` is ambiguous — match on the one carrying the message.
 */
async function expectPoliteStatus(text: string) {
  await waitFor(() => {
    const announced = screen
      .getAllByRole('status')
      .some((el) => el.textContent?.includes(text));
    expect(announced).toBe(true);
  });
}

const QUESTIONS = [
  {
    id: 'q1',
    type: 'MEANING' as const,
    prompt: 'What does “Hund” mean?',
    options: ['cat', 'dog', 'tree', 'window'],
  },
  {
    id: 'q2',
    type: 'MEANING' as const,
    prompt: 'In “Der Hund bellt”, what does “Hund” mean?',
    options: ['dog', 'spoon', 'cloud', 'carpet'],
  },
  {
    id: 'q3',
    type: 'MEANING' as const,
    prompt: 'In “Ich gehe mit dem Hund”, what does “Hund” mean?',
    options: ['tree', 'window', 'dog', 'spoon'],
  },
];

describe('EntryQuizSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchEntryQuiz.mockResolvedValue({ status: 'ENRICHED', questions: QUESTIONS });
  });

  it('renders every question with no accessibility violations', async () => {
    const { container } = renderWithProviders(
      <EntryQuizSection word="Hund" enrichmentStatus="ENRICHED" onOpenOverview={() => {}} />,
    );

    await waitFor(() => expect(screen.getByText('What does “Hund” mean?')).toBeInTheDocument());
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    // Each question's options are grouped and labelled by its own prompt.
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(3);
    expect(within(groups[0]!).getAllByRole('button')).toHaveLength(4);
    expect(within(groups[0]!).getByRole('button', { name: 'dog' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('grades on the server and shows the correct answer plus a path into the entry', async () => {
    submitQuizAttempt.mockResolvedValue({
      correct: false,
      correctIndex: 1,
      correctOption: 'dog',
      explanation: 'Hund is the everyday word for a dog.',
    });
    const onOpenOverview = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <EntryQuizSection word="Hund" enrichmentStatus="ENRICHED" onOpenOverview={onOpenOverview} />,
    );
    await waitFor(() => expect(screen.getByText('What does “Hund” mean?')).toBeInTheDocument());

    const firstQuestion = screen.getAllByRole('group')[0]!;
    await user.click(within(firstQuestion).getByRole('button', { name: 'cat' }));

    await waitFor(() =>
      expect(screen.getByText('Not quite — the answer is “dog”.')).toBeInTheDocument(),
    );
    expect(submitQuizAttempt).toHaveBeenCalledWith(
      'q1',
      expect.objectContaining({ selectedIndex: 0 }),
    );
    expect(screen.getByText('Hund is the everyday word for a dog.')).toBeInTheDocument();
    // Correctness is never signalled by colour alone.
    expect(screen.getByText('✓ Correct answer')).toBeInTheDocument();
    expect(screen.getByText('✗ Your answer')).toBeInTheDocument();
    // Answering locks the question without dropping it out of the tab order.
    expect(within(firstQuestion).getByRole('button', { name: /cat/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // A second tap on an answered question changes nothing.
    await user.click(within(firstQuestion).getByRole('button', { name: /tree/ }));
    expect(submitQuizAttempt).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /See this word in the entry/ }));
    expect(onOpenOverview).toHaveBeenCalled();
  });

  it('shows the same background-work state as the rest of the page while enriching', async () => {
    fetchEntryQuiz.mockResolvedValue({ status: 'ENRICHING', questions: [] });

    renderWithProviders(
      <EntryQuizSection word="Hund" enrichmentStatus="ENRICHING" onOpenOverview={() => {}} />,
    );

    await expectPoliteStatus('Writing quiz questions in the background…');
  });

  it('explains an enriched entry that simply has no questions', async () => {
    fetchEntryQuiz.mockResolvedValue({ status: 'ENRICHED', questions: [] });

    renderWithProviders(
      <EntryQuizSection word="Hund" enrichmentStatus="ENRICHED" onOpenOverview={() => {}} />,
    );

    await expectPoliteStatus('No quiz questions for this word yet.');
  });

  it('lets a learner flag a bad question', async () => {
    reportQuizQuestion.mockResolvedValue({ reason: 'WRONG_ANSWER', comment: null });
    const user = userEvent.setup();

    renderWithProviders(
      <EntryQuizSection word="Hund" enrichmentStatus="ENRICHED" onOpenOverview={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText('What does “Hund” mean?')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: 'Report this question' })[0]!);
    await user.selectOptions(
      screen.getByLabelText("What's wrong with it?"),
      'More than one option is correct',
    );
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() =>
      expect(reportQuizQuestion).toHaveBeenCalledWith('q1', {
        reason: 'AMBIGUOUS',
        comment: undefined,
      }),
    );
    expect(
      await screen.findByText("Thanks — we'll take another look at this question."),
    ).toBeInTheDocument();
  });
});
