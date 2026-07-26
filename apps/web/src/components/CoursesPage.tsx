import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PullToRefresh } from './PullToRefresh';
import type { CourseSummary } from '@vocabahn/shared';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { enrollCourse, fetchCourses, unenrollCourse } from '../api';
import { useStaggerIn } from '../lib/motion';
import { ProgressBar } from './ProgressBar';

function CourseCard({ course }: { course: CourseSummary }) {
  const queryClient = useQueryClient();
  const enroll = useMutation({
    mutationFn: () => enrollCourse(course.slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courses'] }),
  });
  const unenroll = useMutation({
    mutationFn: () => unenrollCourse(course.slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courses'] }),
  });

  return (
    <li className="rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-lg shadow-black/20 transition-colors hover:border-surface-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">{course.title}</h3>
          {course.description && <p className="mt-1 text-sm text-surface-400">{course.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!course.isComplete && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-accent-amber">
              Incomplete / Beta
            </span>
          )}
          {course.cefrLevel && (
            <span className="rounded-full bg-surface-800 px-2.5 py-1 text-xs font-medium text-surface-300">
              {course.cefrLevel}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-surface-500">{course.wordCount} words</p>
      <div className="mt-2">
        <ProgressBar progress={course.progress} wordCount={course.wordCount} />
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          to={`/courses/${course.slug}`}
          className="min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          View words
        </Link>
        {course.enrolled ? (
          <>
            <Link
              to={`/review?courseId=${course.id}`}
              className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Review
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
    </li>
  );
}

export function CoursesPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['courses'], queryFn: fetchCourses });
  const listRef = useRef<HTMLUListElement>(null);
  useStaggerIn(listRef, 'li', [data]);

  return (
    <section aria-label="Courses">
      <PullToRefresh onRefresh={refetch} />
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-surface-400">Courses</h2>
      {isPending && <p aria-live="polite">Loading courses…</p>}
      {isError && <p aria-live="polite" className="text-accent-red">Couldn't load courses.</p>}
      {data && data.length === 0 && <p className="text-surface-400">No courses available yet.</p>}
      {data && data.length > 0 && (
        <ul ref={listRef} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </ul>
      )}
    </section>
  );
}
