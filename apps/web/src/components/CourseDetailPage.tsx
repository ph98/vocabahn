import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PullToRefresh } from './PullToRefresh';
import type { FsrsState } from '@vocabahn/shared';
import { Link, useParams } from 'react-router-dom';
import { enrollCourse, fetchCourse, unenrollCourse } from '../api';
import { trackEvent } from '../lib/telemetry';
import { CEFRBadge } from './CEFRBadge';
import { ProgressBar } from './ProgressBar';
import { ErrorStateForError } from './errors';

const STATE_LABELS: Record<FsrsState, string> = {
  NEW: 'New',
  LEARNING: 'Learning',
  REVIEW: 'Learned',
  RELEARNING: 'Relearning',
};

const STATE_COLORS: Record<FsrsState, string> = {
  NEW: 'bg-surface-800 text-surface-400',
  LEARNING: 'bg-amber-300/20 text-accent-amber',
  RELEARNING: 'bg-amber-300/20 text-accent-amber',
  REVIEW: 'bg-emerald-400/20 text-accent-emerald',
};

export function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const { data: course, isPending, isError, error, refetch } = useQuery({
    queryKey: ['course', slug],
    queryFn: () => fetchCourse(slug!),
    enabled: !!slug,
  });

  const enroll = useMutation({
    mutationFn: () => enrollCourse(slug!),
    onSuccess: () => {
      trackEvent('course_start', { course_slug: slug!, cefr_level: course?.cefrLevel ?? null });
      void queryClient.invalidateQueries({ queryKey: ['course', slug] });
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });

  const unenroll = useMutation({
    mutationFn: () => unenrollCourse(slug!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['course', slug] });
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });

  return (
    <section aria-label="Course detail">
      <PullToRefresh onRefresh={refetch} />
      <Link
        to="/courses"
        className="mb-4 inline-block min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to courses
      </Link>

      {isPending && <p aria-live="polite">Loading course…</p>}
      {isError && (
        <ErrorStateForError
          error={error}
          resource="course"
          backTo="/library"
          backLabel="Back to the library"
          onRetry={() => void refetch()}
          inline
        />
      )}

      {course && (
        <div className="rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-lg shadow-black/20">
          {!course.isComplete && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-accent-amber">
              <span className="font-semibold shrink-0">Incomplete Data / Beta:</span>
              <span>This dataset is partially curated while data collection and classification are ongoing.</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-medium">{course.title}</h2>
              {course.description && <p className="mt-1 text-sm text-surface-400">{course.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!course.isComplete && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-accent-amber">
                  Incomplete / Beta
                </span>
              )}
              {course.cefrLevel && (
                <CEFRBadge level={course.cefrLevel} size="sm" />
              )}
            </div>
          </div>

          <div className="mt-3 max-w-sm">
            <ProgressBar progress={course.progress} emptyLabel="Enrol to track your progress." />
          </div>

          <div className="mt-3 flex gap-2">
            {course.enrolled ? (
              <>
                <Link
                  to={`/review?courseId=${course.id}`}
                  className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Start review
                </Link>
                <button
                  type="button"
                  onClick={() => unenroll.mutate()}
                  disabled={unenroll.isPending}
                  className="min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium text-surface-300 transition-colors hover:border-surface-600 hover:bg-surface-800 hover:text-accent-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
                >
                  {unenroll.isPending ? 'Unenrolling…' : 'Unenroll'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => enroll.mutate()}
                disabled={enroll.isPending}
                className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
              >
                {enroll.isPending ? 'Enrolling…' : 'Enroll'}
              </button>
            )}
          </div>

          <table className="mt-6 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-surface-400">
                <th className="py-2 pr-3 font-medium">Word</th>
                <th className="py-2 pr-3 font-medium">Level</th>
                <th className="py-2 pr-3 font-medium">Translation</th>
                {course.enrolled && <th className="py-2 font-medium">Status</th>}
              </tr>
            </thead>
            <tbody>
              {course.words.map((w) => (
                <tr key={w.dictionaryEntryId} className="border-b border-surface-900">
                  <td className="py-1.5 pr-3">
                    <span lang="de" className="inline-flex items-center gap-1.5">
                      {w.emoji && <span>{w.emoji}</span>}
                      {w.word}
                      <Link
                        to={`/word/${encodeURIComponent(w.word)}${w.pos ? `?pos=${encodeURIComponent(w.pos)}` : ''}`}
                        className="inline-flex text-surface-500 hover:text-indigo-400 p-0.5 transition-colors"
                        title="View in dictionary"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </Link>
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {(w.cefrLevel || course.cefrLevel) ? (
                      <CEFRBadge level={w.cefrLevel ?? course.cefrLevel!} size="sm" />
                    ) : (
                      <span className="text-surface-600">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-surface-400">{w.translation ?? '—'}</td>
                  {course.enrolled && (
                    <td className="py-1.5">
                      <span className={`rounded px-1.5 ${STATE_COLORS[w.cardState ?? 'NEW']}`}>
                        {STATE_LABELS[w.cardState ?? 'NEW']}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
