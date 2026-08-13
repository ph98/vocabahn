import { useMutation, useQuery } from '@tanstack/react-query';
import {
  QUIZ_REPORT_REASON_LABELS,
  type EnrichmentStatus,
  type QuizAttemptResult,
  type QuizQuestion,
  type QuizReportReason,
} from '@vocabahn/shared';
import { useId, useRef, useState } from 'react';
import { fetchEntryQuiz, reportQuizQuestion, submitQuizAttempt } from '../api';

const REPORT_REASONS = Object.keys(QUIZ_REPORT_REASON_LABELS) as QuizReportReason[];
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * The Quiz tab on the word page.
 *
 * Questions are written during enrichment, so an entry that is still
 * `PENDING`/`ENRICHING` genuinely has none yet — this polls on the same 4 s
 * cadence as the rest of the page rather than showing an empty tab.
 */
export function EntryQuizSection({
  word,
  enrichmentStatus,
  onOpenOverview,
}: {
  word: string;
  enrichmentStatus: EnrichmentStatus;
  onOpenOverview: () => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['entry-quiz', word],
    queryFn: () => fetchEntryQuiz(word),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'PENDING' || status === 'ENRICHING' ? 4000 : false;
    },
  });

  const status = data?.status ?? enrichmentStatus;
  const questions = data?.questions ?? [];

  if (isPending) {
    return (
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <div className="h-4 w-32 rounded skeleton-shimmer" />
        <div className="h-11 w-full rounded-xl skeleton-shimmer" />
        <div className="h-11 w-full rounded-xl skeleton-shimmer" />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="status" className="text-sm text-accent-red">
        Couldn't load the quiz for “{word}”.
      </p>
    );
  }

  if (questions.length === 0) {
    if (status === 'PENDING' || status === 'ENRICHING') {
      return (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent-amber/10 px-3 py-2 text-sm text-accent-amber"
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none rounded-full border-2 border-accent-amber/30 border-t-accent-amber"
          />
          Writing quiz questions in the background…
        </p>
      );
    }
    return (
      <p role="status" className="text-sm text-surface-400">
        {status === 'FAILED'
          ? 'Enrichment failed for this word, so it has no quiz yet.'
          : 'No quiz questions for this word yet.'}
      </p>
    );
  }

  return (
    <section aria-label={`Quiz for ${word}`}>
      <ol className="space-y-6">
        {questions.map((question, index) => (
          <li key={question.id}>
            <QuizQuestionCard
              question={question}
              index={index}
              total={questions.length}
              onOpenOverview={onOpenOverview}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function QuizQuestionCard({
  question,
  index,
  total,
  onOpenOverview,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  onOpenOverview: () => void;
}) {
  const baseId = useId();
  const promptId = `${baseId}-prompt`;
  const shownAt = useRef(Date.now());
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<QuizAttemptResult | null>(null);

  const attempt = useMutation({
    mutationFn: (selectedIndex: number) =>
      submitQuizAttempt(question.id, {
        selectedIndex,
        latencyMs: Math.max(0, Date.now() - shownAt.current),
      }),
    onSuccess: (data) => setResult(data),
  });

  const answer = (optionIndex: number) => {
    if (result || attempt.isPending) return;
    setSelected(optionIndex);
    attempt.mutate(optionIndex);
  };

  return (
    <div className="rounded-2xl border border-surface-800/60 bg-surface-950/80 p-4">
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
        Question {index + 1} of {total}
      </h4>
      <p id={promptId} className="mb-3 text-surface-100">
        {question.prompt}
      </p>

      <div role="group" aria-labelledby={promptId} className="flex flex-col gap-2">
        {question.options.map((option, optionIndex) => {
          const isCorrect = result !== null && optionIndex === result.correctIndex;
          const isChosenWrong = result !== null && optionIndex === selected && !result.correct;
          // `aria-disabled` rather than `disabled`: an answered option stays
          // focusable, so a keyboard user does not lose their place mid-quiz.
          const locked = result !== null || attempt.isPending;
          return (
            <button
              key={`${optionIndex}-${option}`}
              type="button"
              onClick={() => answer(optionIndex)}
              aria-disabled={locked}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                isCorrect
                  ? 'border-emerald-400/60 bg-emerald-400/10 text-accent-emerald'
                  : isChosenWrong
                    ? 'border-red-400/60 bg-red-400/10 text-accent-red'
                    : locked
                      ? 'cursor-default border-surface-700 text-surface-200 opacity-60'
                      : 'border-surface-700 text-surface-200 hover:border-surface-600 hover:bg-surface-800'
              }`}
            >
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-800 text-xs text-surface-300"
              >
                {OPTION_LETTERS[optionIndex] ?? optionIndex + 1}
              </span>
              <span className="min-w-0">{option}</span>
              {/* Never signal correctness by colour alone. */}
              {isCorrect && <span className="ml-auto shrink-0 text-xs">✓ Correct answer</span>}
              {isChosenWrong && <span className="ml-auto shrink-0 text-xs">✗ Your answer</span>}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-3">
        {attempt.isError && (
          <p className="text-sm text-accent-red">Couldn't record that answer — try again.</p>
        )}
        {result && (
          <div className="space-y-2">
            <p className={`text-sm ${result.correct ? 'text-accent-emerald' : 'text-accent-red'}`}>
              {result.correct
                ? 'Correct.'
                : `Not quite — the answer is “${result.correctOption}”.`}
            </p>
            {result.explanation && <p className="text-sm text-surface-300">{result.explanation}</p>}
            <button
              type="button"
              onClick={onOpenOverview}
              className="min-h-11 rounded-xl px-2 text-sm text-indigo-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              See this word in the entry →
            </button>
          </div>
        )}
      </div>

      <ReportQuestion questionId={question.id} />
    </div>
  );
}

/**
 * "This question is wrong", following the EntryFeedback widget: a quiet
 * disclosure that expands into a reason plus optional detail, one report per
 * question per user.
 */
function ReportQuestion({ questionId }: { questionId: string }) {
  const baseId = useId();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<QuizReportReason>('WRONG_ANSWER');
  const [comment, setComment] = useState('');

  const report = useMutation({
    mutationFn: () => reportQuizQuestion(questionId, { reason, comment: comment || undefined }),
  });

  if (report.isSuccess) {
    return (
      <p role="status" className="mt-3 text-xs text-accent-emerald">
        Thanks — we'll take another look at this question.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="min-h-11 rounded-xl px-2 text-xs text-surface-400 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {expanded ? 'Cancel report' : 'Report this question'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <label htmlFor={`${baseId}-reason`} className="block text-xs text-surface-500">
            What's wrong with it?
          </label>
          <select
            id={`${baseId}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value as QuizReportReason)}
            className="min-h-11 w-full rounded-xl border border-surface-700 bg-surface-900 px-3 text-sm transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {QUIZ_REPORT_REASON_LABELS[r]}
              </option>
            ))}
          </select>

          <label htmlFor={`${baseId}-comment`} className="block text-xs text-surface-500">
            Additional details (optional)
          </label>
          <textarea
            id={`${baseId}-comment`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-xl border border-surface-700 bg-surface-950 px-3 py-2 text-sm placeholder:text-surface-500 transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            placeholder="What did you notice?"
          />

          <button
            type="button"
            onClick={() => report.mutate()}
            disabled={report.isPending}
            className="min-h-11 rounded-xl border border-surface-700 px-4 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
          >
            {report.isPending ? 'Sending…' : 'Send report'}
          </button>
          {report.isError && (
            <p role="status" className="text-xs text-accent-red">
              Couldn't send that report — try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
