import type {
  StoryQuizQuestion,
  StoryQuizResultItem,
  StoryTarget,
  SubmitStoryQuizAnswer,
} from '@vocabahn/shared';
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const PRIMARY_BUTTON =
  'min-h-11 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60';
const SECONDARY_BUTTON =
  'min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

interface StoryQuizStepperProps {
  questions: StoryQuizQuestion[];
  onComplete: (answers: SubmitStoryQuizAnswer[]) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function StoryQuizStepper({
  questions,
  onComplete,
  onCancel,
  isSubmitting,
}: StoryQuizStepperProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Map<string, { selectedIndex: number; latencyMs: number }>>(
    new Map(),
  );

  const shownAt = useRef(Date.now());
  const promptId = useId();

  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion ? selectedAnswers.get(currentQuestion.id) : undefined;
  const isLastQuestion = currentIndex === questions.length - 1;

  useEffect(() => {
    shownAt.current = Date.now();
  }, [currentIndex]);

  // Keyboard navigation for options (1-4) and Enter to advance
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting || !currentQuestion) return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= currentQuestion.options.length) {
        e.preventDefault();
        selectOption(num - 1);
      } else if (e.key === 'Enter' && currentAnswer !== undefined) {
        e.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!currentQuestion) return null;

  const selectOption = (optionIndex: number) => {
    const latencyMs = Math.max(0, Date.now() - shownAt.current);
    setSelectedAnswers((prev) => {
      const next = new Map(prev);
      next.set(currentQuestion.id, { selectedIndex: optionIndex, latencyMs });
      return next;
    });
  };

  const goNext = () => {
    if (isLastQuestion) {
      const answersList: SubmitStoryQuizAnswer[] = questions.map((q) => {
        const recorded = selectedAnswers.get(q.id);
        return {
          questionId: q.id,
          selectedIndex: recorded?.selectedIndex ?? 0,
          latencyMs: recorded?.latencyMs,
        };
      });
      onComplete(answersList);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const progressPercent = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="rounded-3xl border border-surface-800 bg-surface-900 p-6 shadow-xl sm:p-8">
      {/* Stepper Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Story Quiz
          </span>
          <p className="text-sm text-surface-400">
            Question {currentIndex + 1} of {questions.length}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-xs text-surface-400 underline underline-offset-4 hover:text-surface-200"
        >
          Back to reading
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-800" aria-hidden="true">
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Question Card */}
      <div className="mt-6 space-y-4">
        {currentQuestion.targetWord && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Testing: <span className="font-semibold text-white">{currentQuestion.targetWord}</span>
          </div>
        )}

        <h3 id={promptId} className="text-lg font-medium leading-snug text-surface-100">
          {currentQuestion.prompt}
        </h3>

        {/* Options */}
        <div role="group" aria-labelledby={promptId} className="flex flex-col gap-2.5 pt-2">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = currentAnswer?.selectedIndex === idx;
            return (
              <button
                key={`${idx}-${option}`}
                type="button"
                onClick={() => selectOption(idx)}
                aria-pressed={isSelected}
                disabled={isSubmitting}
                className={`flex min-h-12 w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  isSelected
                    ? 'border-indigo-400 bg-indigo-500/15 text-indigo-100 shadow-sm shadow-indigo-950/40 ring-1 ring-indigo-400'
                    : 'border-surface-700 bg-surface-950/60 text-surface-200 hover:border-surface-600 hover:bg-surface-800'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold transition-colors ${
                    isSelected
                      ? 'bg-indigo-500 text-white'
                      : 'bg-surface-800 text-surface-400'
                  }`}
                >
                  {OPTION_LETTERS[idx] ?? idx + 1}
                </span>
                <span className="flex-1">{option}</span>
                {isSelected && (
                  <span className="shrink-0 text-xs font-semibold text-indigo-300">Selected</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-surface-800 pt-5">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0 || isSubmitting}
          className={`inline-flex items-center gap-1.5 ${SECONDARY_BUTTON} disabled:invisible`}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Previous
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={currentAnswer === undefined || isSubmitting}
          className={`inline-flex items-center gap-2 ${PRIMARY_BUTTON}`}
        >
          {isSubmitting ? (
            'Grading & Saving…'
          ) : isLastQuestion ? (
            <>
              Submit Quiz & Complete
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </>
          ) : (
            <>
              Next Question
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface StoryQuizResultsViewProps {
  score?: { correct: number; total: number };
  quizResults?: StoryQuizResultItem[];
  questions?: StoryQuizQuestion[];
  targets: StoryTarget[];
  notUnderstood: Set<string>;
  onStartOver: () => void;
}

export function StoryQuizResultsView({
  score,
  quizResults,
  questions,
  targets,
  notUnderstood,
  onStartOver,
}: StoryQuizResultsViewProps) {
  const total = score?.total ?? quizResults?.length ?? questions?.length ?? 0;
  const correct = score?.correct ?? quizResults?.filter((r) => r.correct).length ?? 0;

  const isPerfect = total > 0 && correct === total;

  return (
    <div
      role="status"
      className="space-y-6 rounded-3xl border border-surface-800 bg-surface-900 p-6 shadow-xl sm:p-8"
    >
      {/* Header Banner */}
      <div className="text-center">
        <span className="text-3xl" aria-hidden="true">
          {isPerfect ? '🎉' : correct > 0 ? '👏' : '💪'}
        </span>
        <h3 className="mt-2 text-xl font-bold text-surface-100">
          {total > 0
            ? isPerfect
              ? 'Outstanding Comprehension!'
              : `${correct} of ${total} Words Mastered`
            : notUnderstood.size === 0
              ? `All ${targets.length} words landed.`
              : `${notUnderstood.size} of ${targets.length} words didn't land.`}
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-surface-400">
          {total > 0
            ? isPerfect
              ? 'Every tested word landed cleanly. Your memory intervals for these words have advanced in spaced repetition.'
              : 'Correct words gained spaced repetition strength. Unfamiliar words have been scheduled for prompt review.'
            : notUnderstood.size === 0
              ? 'All studied words in this story landed cleanly.'
              : 'Words that didn\'t land have been noted for review.'}
        </p>
      </div>

      {/* Breakdown Cards */}
      {quizResults && quizResults.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
            Vocabulary Breakdown
          </h4>
          <div className="space-y-2.5">
            {quizResults.map((result) => (
              <div
                key={result.questionId}
                className={`rounded-2xl border p-4 transition-colors ${
                  result.correct
                    ? 'border-emerald-500/30 bg-emerald-950/20 text-surface-200'
                    : 'border-red-500/30 bg-red-950/20 text-surface-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {result.correct ? (
                      <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <XCircle className="size-5 shrink-0 text-red-400" aria-hidden="true" />
                    )}
                    <span className="font-semibold text-white">{result.word}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        result.correct
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {result.correct ? 'Spaced Repetition Advanced' : 'Queued for Review'}
                    </span>
                  </div>
                  <Link
                    to={`/word/${encodeURIComponent(result.word)}`}
                    className="text-xs text-indigo-300 underline underline-offset-4 hover:text-indigo-200"
                  >
                    View word →
                  </Link>
                </div>

                {result.explanation && (
                  <p className="mt-2 text-xs leading-relaxed text-surface-300">
                    {result.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Untapped / Other Studied Words in Story */}
      {targets.length > (quizResults?.length ?? 0) && (
        <div className="border-t border-surface-800 pt-4">
          <p className="text-xs uppercase tracking-wider text-surface-500">
            Other words studied in this story:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {targets.map((t) => {
              const isNotUnderstood = notUnderstood.has(t.entryId);
              return (
                <Link
                  key={t.entryId}
                  to={`/word/${encodeURIComponent(t.word)}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    isNotUnderstood
                      ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                      : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                  }`}
                >
                  <span>{t.word}</span>
                  {isNotUnderstood && <span className="text-[10px] text-amber-400">(flagged)</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Action CTA */}
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-surface-800 pt-4">
        <button
          type="button"
          onClick={onStartOver}
          className={`inline-flex items-center gap-2 ${PRIMARY_BUTTON}`}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Read something else
        </button>

        <Link
          to="/review"
          className={`inline-flex items-center gap-2 ${SECONDARY_BUTTON}`}
        >
          Review flashcards
        </Link>
      </div>
    </div>
  );
}
