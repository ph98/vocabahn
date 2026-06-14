import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { fetchDashboard } from '../api';
import { ProgressBar } from './ProgressBar';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center shadow-lg shadow-black/20">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );
}

function heatmapClassForValue(value?: CalendarHeatmap.ReactCalendarHeatmapValue<string>) {
  const count = typeof value?.count === 'number' ? value.count : 0;
  if (count === 0) return 'color-empty';
  return `color-scale-${Math.min(count, 4)}`;
}

function heatmapTitleForValue(value?: CalendarHeatmap.ReactCalendarHeatmapValue<string>) {
  if (!value) return 'No data';
  const count = typeof value.count === 'number' ? value.count : 0;
  return `${count} review${count === 1 ? '' : 's'} on ${value.date}`;
}

export function DashboardPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });

  return (
    <section aria-label="Dashboard" className="space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">Dashboard</h2>
      {isPending && <p aria-live="polite">Loading dashboard…</p>}
      {isError && <p aria-live="polite" className="text-red-400">Couldn't load your dashboard.</p>}

      {data && (
        <>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-lg shadow-black/20">
            <p className="text-4xl font-bold">
              <span aria-hidden="true">🔥</span> {data.streak}
            </p>
            <p className="mt-1 text-sm text-neutral-400">day streak</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Due today" value={data.stats.dueToday} />
            <StatCard label="Reviewed today" value={data.stats.reviewedToday} />
            <StatCard label="Known" value={data.stats.totalKnown} />
            <StatCard label="Learning" value={data.stats.totalLearning} />
            <StatCard label="New" value={data.stats.totalNew} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-lg shadow-black/20">
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">Activity</h3>
            <CalendarHeatmap
              startDate={data.heatmap[0]?.date}
              endDate={data.heatmap[data.heatmap.length - 1]?.date}
              values={data.heatmap}
              classForValue={heatmapClassForValue}
              titleForValue={heatmapTitleForValue}
              showWeekdayLabels
            />
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg shadow-black/20">
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">Course progress</h3>
            {data.courses.length === 0 && (
              <p className="text-neutral-400">
                You're not enrolled in any courses yet.{' '}
                <Link to="/courses" className="text-indigo-400 underline-offset-2 hover:underline">
                  Browse courses
                </Link>
                .
              </p>
            )}
            {data.courses.length > 0 && (
              <ul className="space-y-4">
                {data.courses.map((course) => (
                  <li key={course.id}>
                    <div className="flex items-center justify-between gap-4">
                      <Link to={`/courses/${course.slug}`} className="font-medium hover:underline">
                        {course.title}
                      </Link>
                    </div>
                    <div className="mt-2">
                      <ProgressBar progress={course.progress} wordCount={course.wordCount} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
