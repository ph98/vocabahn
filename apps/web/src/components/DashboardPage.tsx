import { useQuery } from '@tanstack/react-query';
import { PullToRefresh } from './PullToRefresh';
import { Link } from 'react-router-dom';
import { fetchDashboard } from '../api';
import { ProgressBar } from './ProgressBar';
import { ActivityHeatmap } from './ActivityHeatmap';
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

function StatCard({ label, value, className = '' }: { label: string; value: number, className?: string }) {
  return (
    <div className={`dashboard-card flex flex-col justify-center rounded-3xl border border-surface-800/60 bg-gradient-to-br from-surface-900/80 to-surface-950/80 backdrop-blur-md p-4 text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(79,70,229,0.15)] hover:border-indigo-500/30 ${className}`}>
      <p className="text-3xl font-semibold bg-clip-text text-transparent bg-gradient-to-br from-white to-surface-400">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-surface-400">{label}</p>
    </div>
  );
}

export function DashboardPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (data) {
      gsap.fromTo(
        '.dashboard-card',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.1,
          clearProps: 'all', // Ensure GSAP doesn't override hover transforms
        }
      );
    }
  }, { dependencies: [data], scope: containerRef });

  const activeDays = (data?.heatmap ?? []).filter((d) => d.count > 0).reverse();

  return (
    <section aria-label="Dashboard" className="space-y-5" ref={containerRef}>
      <PullToRefresh onRefresh={refetch} />
      <h2 className="text-sm font-medium uppercase tracking-wide text-surface-400 pl-1">Dashboard</h2>
      {isPending && <p aria-live="polite" className="pl-1 text-surface-300">Loading dashboard…</p>}
      {isError && <p aria-live="polite" className="pl-1 text-accent-red">Couldn't load your dashboard.</p>}

      {data && (
        <div className="flex flex-col gap-5">
          <div className="dashboard-card relative overflow-hidden group rounded-3xl border border-surface-800/60 bg-gradient-to-br from-surface-900/80 to-surface-950/80 backdrop-blur-md p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_12px_48px_rgba(251,146,60,0.2)] hover:border-orange-500/40">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out" />
            <div className="relative z-10 flex flex-col items-center justify-center">
              <p className="text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-surface-300 drop-shadow-sm flex items-center justify-center gap-3">
                <span aria-hidden="true" className="drop-shadow-lg inline-block hover:scale-110 transition-transform duration-300 cursor-default">🔥</span> 
                {data.streak}
              </p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-surface-400">day streak</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard className="col-span-2 row-span-2 p-6" label="Due today" value={data.stats.dueToday} />
            <StatCard label="Reviewed" value={data.stats.reviewedToday} />
            <StatCard label="Known" value={data.stats.totalKnown} />
            <StatCard label="Learning" value={data.stats.totalLearning} />
            <StatCard label="New" value={data.stats.totalNew} />
          </div>

          <div className="dashboard-card relative overflow-hidden rounded-3xl border border-surface-800/60 bg-gradient-to-br from-surface-900/90 to-surface-950/90 backdrop-blur-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all duration-500 hover:border-indigo-500/30">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-widest text-surface-400 relative z-10">Activity</h3>
            
            <div aria-hidden="true" className="relative z-10">
              <ActivityHeatmap data={data.heatmap} />
            </div>
            
            <details className="mt-4 relative z-10 group">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-surface-400 transition-colors hover:text-surface-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white list-none flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-surface-800 flex items-center justify-center text-[10px] group-open:rotate-90 transition-transform">▶</span>
                View activity as a list
              </summary>
              {activeDays.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-surface-800/50 bg-surface-900/30">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-surface-800 text-surface-400 bg-surface-900/50">
                        <th className="py-2.5 px-4 font-medium">Date</th>
                        <th className="py-2.5 px-4 font-medium text-right">Reviews</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800/50">
                      {activeDays.map(({ date, count }) => (
                        <tr key={date} className="hover:bg-surface-800/20 transition-colors">
                          <td className="py-2.5 px-4 text-surface-200">{new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                          <td className="py-2.5 px-4 text-right font-medium">{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-surface-400 pl-6">No reviews in this period yet.</p>
              )}
            </details>
          </div>

          <div className="dashboard-card rounded-3xl border border-surface-800/60 bg-gradient-to-br from-surface-900/80 to-surface-950/80 backdrop-blur-md p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)] transition-all duration-300 hover:border-indigo-500/30">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-surface-400">Course progress</h3>
            {data.courses.length === 0 && (
              <p className="text-surface-400">
                You're not enrolled in any courses yet.{' '}
                <Link to="/courses" className="text-accent-indigo font-medium hover:text-indigo-300 transition-colors">
                  Browse courses &rarr;
                </Link>
              </p>
            )}
            {data.courses.length > 0 && (
              <ul className="space-y-5">
                {data.courses.map((course) => (
                  <li key={course.id} className="group">
                    <div className="flex items-center justify-between gap-4">
                      <Link to={`/courses/${course.slug}`} className="font-medium text-surface-100 group-hover:text-indigo-300 transition-colors text-lg">
                        {course.title}
                      </Link>
                    </div>
                    <div className="mt-3">
                      <ProgressBar progress={course.progress} wordCount={course.wordCount} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
