import { useQuery } from '@tanstack/react-query';
import { PullToRefresh } from './PullToRefresh';
import { Link } from 'react-router-dom';
import { fetchDashboard, fetchLatestStory, fetchMe } from '../api';
import { topicLabel } from '@vocabahn/shared';
import { ProgressBar } from './ProgressBar';
import { ActivityHeatmap } from './ActivityHeatmap';
import { CountUp } from './CountUp';
import { CEFRCalibrationCard } from './CEFRCalibrationCard';
import { useRef, type ComponentType } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from '../lib/motion';
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CheckCheck,
  ChevronRight,
  Flame,
  PartyPopper,
  Sparkles,
} from 'lucide-react';

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  className = '',
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  accent: string;
  className?: string;
}) {
  return (
    <div className={`dashboard-card flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-surface-800/60 bg-gradient-to-br from-surface-900/80 to-surface-950/80 backdrop-blur-md p-5 text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(79,70,229,0.15)] hover:border-indigo-500/30 motion-reduce:hover:translate-y-0 ${className}`}>
      <Icon aria-hidden className={`size-5 ${accent}`} />
      <CountUp value={value} className="text-3xl font-bold tabular-nums text-surface-100" />
      <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">{label}</p>
    </div>
  );
}

/**
 * The way a learner finds out a story is waiting. The scheduler writes it
 * overnight in their timezone, and until push notifications exist nothing tells
 * them — so the dashboard, which is where they land, does.
 *
 * Renders nothing when there is no unfinished story, so a learner who reads
 * every morning never sees a stale card.
 */
function TodaysReadCard() {
  const { data: story } = useQuery({
    queryKey: ['story-latest'],
    queryFn: fetchLatestStory,
  });

  if (!story) return null;

  const waiting = story.status === 'PENDING' || story.status === 'GENERATING';
  if (story.status === 'FAILED') return null;

  return (
    <Link
      to="/story"
      className="dashboard-card flex items-center justify-between gap-4 rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-surface-900/80 to-surface-950/80 p-5 shadow-lg backdrop-blur-md transition-colors hover:border-indigo-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-300">
          {story.origin === 'DAILY' ? "Today's read" : 'Continue reading'}
        </p>
        {waiting ? (
          <p className="text-sm text-surface-300">Still being written…</p>
        ) : (
          <>
            <p lang="de" className="truncate text-sm font-medium text-surface-100">
              {story.title ?? 'Your story is ready'}
            </p>
            <p className="truncate text-xs text-surface-400">
              {[topicLabel(story.topic), story.source && `via ${story.source.name}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </>
        )}
      </div>
      <ChevronRight className="size-5 shrink-0 text-indigo-300" aria-hidden="true" />
    </Link>
  );
}

export function DashboardPage() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (data) {
      if (prefersReducedMotion()) return;
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

      {user && !user.cefrLevel && (
        <CEFRCalibrationCard user={user} compact />
      )}

      <TodaysReadCard />

      {data && (
        <div className="flex flex-col gap-5">
          {user && !user.cefrLevel && (
            <div className="dashboard-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-surface-900/80 to-surface-950/80 p-5 backdrop-blur-md shadow-lg">
              <div className="space-y-1">
                <p className="text-sm font-bold text-indigo-300">Set your German CEFR Level</p>
                <p className="text-xs text-surface-300">
                  Calibrate card ordering and auto-graduate basic filler words by selecting your current level in profile settings.
                </p>
              </div>
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-indigo-500"
              >
                Calibrate Level
                <ChevronRight className="size-4" />
              </Link>
            </div>
          )}

          {/* Bento Box Grid for Statistics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="dashboard-card relative overflow-hidden rounded-3xl border border-surface-800/60 bg-gradient-to-br from-surface-900/90 via-surface-900/80 to-surface-950/90 backdrop-blur-md p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.3)] sm:col-span-2 lg:col-span-2 flex flex-col justify-between">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl"
              />
              <div className="relative z-10 flex flex-col items-center gap-6 text-center my-auto">
                {data.streak > 0 ? (
                  <div>
                    <p className="flex items-center justify-center gap-3 text-6xl font-extrabold tracking-tight text-surface-100">
                      <Flame aria-hidden className="size-12 text-accent-amber" fill="currentColor" />
                      <CountUp value={data.streak} className="tabular-nums" />
                    </p>
                    <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-surface-400">day streak</p>
                  </div>
                ) : (
                  <div>
                    <Flame aria-hidden className="mx-auto size-10 text-surface-600" />
                    <p className="mt-3 text-2xl font-bold tracking-tight text-surface-100">Start your streak today</p>
                    <p className="mt-1 text-surface-400">One review session is all it takes.</p>
                  </div>
                )}

                {data.stats.dueToday > 0 ? (
                  <Link
                    to="/review"
                    className="group inline-flex min-h-12 items-center gap-3 rounded-2xl bg-indigo-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition-[background-color,transform] hover:bg-indigo-400 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Start review
                    <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-sm tabular-nums">
                      {data.stats.dueToday.toLocaleString()} due
                    </span>
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <p className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-2.5 text-sm font-medium text-accent-emerald">
                    <PartyPopper aria-hidden className="size-4" />
                    All caught up — nothing due today
                  </p>
                )}
              </div>
            </div>

            <StatCard label="Reviewed today" value={data.stats.reviewedToday} icon={CheckCheck} accent="text-accent-sky" />
            <StatCard label="Known" value={data.stats.totalKnown} icon={BadgeCheck} accent="text-accent-emerald" />
            <StatCard label="Learning" value={data.stats.totalLearning} icon={Brain} accent="text-accent-amber" />
            <StatCard label="New" value={data.stats.totalNew} icon={Sparkles} accent="text-accent-indigo" />
          </div>

          <div className="dashboard-card relative overflow-hidden rounded-3xl border border-surface-800/60 bg-gradient-to-br from-surface-900/90 to-surface-950/90 backdrop-blur-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all duration-500 hover:border-indigo-500/30">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-widest text-surface-400 relative z-10">Activity</h3>
            
            <div aria-hidden="true" className="relative z-10">
              <ActivityHeatmap data={data.heatmap} />
            </div>
            
            <details className="mt-4 relative z-10 group">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-surface-400 transition-colors hover:text-surface-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white list-none flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-surface-800 flex items-center justify-center group-open:rotate-90 transition-transform">
                  <ChevronRight aria-hidden className="size-3" />
                </span>
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
                      {!course.isComplete && (
                        <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-accent-amber">
                          Incomplete / Beta
                        </span>
                      )}
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
