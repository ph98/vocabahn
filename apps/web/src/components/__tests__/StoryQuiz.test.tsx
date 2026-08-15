import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StoryQuizQuestion, StoryQuizResultItem, StoryTarget } from '@vocabahn/shared';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoryQuizResultsView, StoryQuizStepper } from '../StoryQuiz';

afterEach(() => {
  cleanup();
});

const SAMPLE_QUESTIONS: StoryQuizQuestion[] = [
  {
    id: 'q1',
    order: 0,
    entryId: 'e1',
    targetWord: 'Haus',
    prompt: 'What does "Haus" mean in this story context?',
    options: ['house', 'apple', 'water', 'car'],
  },
  {
    id: 'q2',
    order: 1,
    entryId: 'e2',
    targetWord: 'grün',
    prompt: 'What does "grün" mean?',
    options: ['green', 'yellow', 'blue', 'red'],
  },
];

const SAMPLE_TARGETS: StoryTarget[] = [
  {
    entryId: 'e1',
    word: 'Haus',
    surfaceForm: 'Haus',
    translation: 'house',
    emoji: '🏠',
    pos: 'noun',
    cefrLevel: 'A1.1',
    gloss: 'building',
    audioUrl: null,
    example: null,
    understood: true,
  },
  {
    entryId: 'e2',
    word: 'grün',
    surfaceForm: 'grün',
    translation: 'green',
    emoji: null,
    pos: 'adj',
    cefrLevel: 'A1.1',
    gloss: null,
    audioUrl: null,
    example: null,
    understood: true,
  },
  {
    entryId: 'e3',
    word: 'schnell',
    surfaceForm: 'schnell',
    translation: 'fast',
    emoji: null,
    pos: 'adj',
    cefrLevel: 'A2.1',
    gloss: null,
    audioUrl: null,
    example: null,
    understood: true,
  },
];

describe('StoryQuizStepper', () => {
  it('renders question and navigates through steps', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    render(
      <StoryQuizStepper
        questions={SAMPLE_QUESTIONS}
        onComplete={onComplete}
        onCancel={onCancel}
        isSubmitting={false}
      />,
    );

    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Haus')).toBeInTheDocument();
    expect(screen.getByText('What does "Haus" mean in this story context?')).toBeInTheDocument();

    // Select option
    fireEvent.click(screen.getByRole('button', { name: /house/ }));
    expect(screen.getByText('Selected')).toBeInTheDocument();

    // Advance
    fireEvent.click(screen.getByRole('button', { name: /Next Question/ }));

    // Question 2
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('grün')).toBeInTheDocument();

    // Can go back to previous
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();

    // Advance again and pick option 2
    fireEvent.click(screen.getByRole('button', { name: /Next Question/ }));
    fireEvent.click(screen.getByRole('button', { name: /green/ }));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Submit Quiz & Complete/ }));
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ questionId: 'q1', selectedIndex: 0 }),
      expect.objectContaining({ questionId: 'q2', selectedIndex: 0 }),
    ]);
  });

  it('supports keyboard shortcuts for selecting options', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    render(
      <StoryQuizStepper
        questions={SAMPLE_QUESTIONS}
        onComplete={onComplete}
        onCancel={onCancel}
        isSubmitting={false}
      />,
    );

    // Press '1'
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByText('Selected')).toBeInTheDocument();

    // Press 'Enter'
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
  });
});

describe('StoryQuizResultsView', () => {
  it('renders score breakdown and explanations', () => {
    const onStartOver = vi.fn();
    const quizResults: StoryQuizResultItem[] = [
      {
        questionId: 'q1',
        entryId: 'e1',
        word: 'Haus',
        selectedIndex: 0,
        correctIndex: 0,
        correct: true,
        explanation: 'Haus is a house.',
      },
      {
        questionId: 'q2',
        entryId: 'e2',
        word: 'grün',
        selectedIndex: 1,
        correctIndex: 0,
        correct: false,
        explanation: 'Grün means green.',
      },
    ];

    render(
      <MemoryRouter>
        <StoryQuizResultsView
          score={{ correct: 1, total: 2 }}
          quizResults={quizResults}
          questions={SAMPLE_QUESTIONS}
          targets={SAMPLE_TARGETS}
          notUnderstood={new Set(['e2'])}
          onStartOver={onStartOver}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 of 2 Words Mastered')).toBeInTheDocument();
    expect(screen.getByText('Spaced Repetition Advanced')).toBeInTheDocument();
    expect(screen.getByText('Queued for Review')).toBeInTheDocument();
    expect(screen.getByText('Haus is a house.')).toBeInTheDocument();
    expect(screen.getByText('Grün means green.')).toBeInTheDocument();
    expect(screen.getByText('schnell')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Read something else/ }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
