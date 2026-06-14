import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FsrsState } from '@vocabahn/shared';
import { Link, useParams } from 'react-router-dom';
import { enrollCourse, fetchCourse } from '../api';

const STATE_LABELS: Record<FsrsState, string> = {
  NEW: 'New',
  LEARNING: 'Learning',
  REVIEW: 'Learned',
  RELEARNING: 'Relearning',
};

const STATE_COLORS: Record<FsrsState, string> = {
  NEW: 'bg-neutral-800 text-neutral-400',
  LEARNING: 'bg-amber-300/20 text-amber-300',
  RELEARNING: 'bg-amber-300/20 text-amber-300',
  REVIEW: 'bg-emerald-400/20 text-emerald-400',
};

export function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const { data: course, isPending, isError } = useQuery({
    queryKey: ['course', slug],
    queryFn: () => fetchCourse(slug!),
    enabled: !!slug,
  });

  const enroll = useMutation({
    mutationFn: () => enrollCourse(slug!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['course', slug] });
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });

  return (
    <section aria-label="Course detail">
      <Link
        to="/courses"
        className="mb-4 inline-block min-h-11 rounded-xl border border-neutral-700 px-4 py-2.5 text-sm transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to courses
      </Link>

      {isPending && <p aria-live="polite">Loading course…</p>}
      {isError && <p aria-live="polite" className="text-red-400">Couldn't load this course.</p>}

      {course && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg shadow-black/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-medium">{course.title}</h2>
              {course.description && <p className="mt-1 text-sm text-neutral-400">{course.description}</p>}
            </div>
            {course.cefrLevel && (
              <span className="shrink-0 rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300">
                {course.cefrLevel}
              </span>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            {course.enrolled ? (
              <Link
                to={`/review?courseId=${course.id}`}
                className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Start review
              </Link>
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
              <tr className="border-b border-neutral-800 text-neutral-400">
                <th className="py-2 pr-3 font-medium">Word</th>
                <th className="py-2 pr-3 font-medium">Translation</th>
                {course.enrolled && <th className="py-2 font-medium">Status</th>}
              </tr>
            </thead>
            <tbody>
              {course.words.map((w) => (
                <tr key={w.dictionaryEntryId} className="border-b border-neutral-900">
                  <td className="py-1.5 pr-3" lang="de">
                    {w.emoji && <span className="mr-1">{w.emoji}</span>}
                    {w.word}
                  </td>
                  <td className="py-1.5 pr-3 text-neutral-400">{w.translation ?? '—'}</td>
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
