interface StreakBadgeProps {
  days: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StreakBadge({ days, className = '', size = 'md' }: StreakBadgeProps) {
  let color = 'from-amber-600/30 to-amber-500/10 text-amber-400 border-amber-500/40';
  let badgeTitle = 'Bronze Streak';
  let icon = '🔥';

  if (days >= 100) {
    color = 'from-purple-600/30 via-indigo-500/20 to-emerald-500/20 text-purple-300 border-purple-400/50 shadow-purple-500/30';
    badgeTitle = 'Century Master';
    icon = '👑';
  } else if (days >= 30) {
    color = 'from-slate-400/30 to-slate-200/10 text-slate-200 border-slate-300/40 shadow-slate-300/20';
    badgeTitle = 'Silver Streak';
    icon = '⚡';
  } else if (days >= 7) {
    color = 'from-amber-600/30 to-amber-500/10 text-amber-400 border-amber-500/40';
    badgeTitle = 'Weekly Streak';
    icon = '🔥';
  }

  const sizes = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-2 font-bold',
    lg: 'px-4 py-2 text-base gap-2.5 font-extrabold',
  };

  return (
    <div
      className={`inline-flex items-center rounded-xl border bg-gradient-to-br backdrop-blur-xl shadow-lg transition-transform hover:scale-105 ${color} ${sizes[size]} ${className}`}
      title={`${days} Day Streak — ${badgeTitle}`}
    >
      <span className="text-base">{icon}</span>
      <span className="font-mono tracking-tight">{days} Days</span>
      <span className="hidden sm:inline text-[10px] uppercase opacity-75 font-sans tracking-wider">{badgeTitle}</span>
    </div>
  );
}

export function DailyGoalBadge({ isCompleted, className = '' }: { isCompleted: boolean; className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold backdrop-blur-xl transition-all ${
        isCompleted
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-emerald-500/20'
          : 'bg-surface-800/40 border-surface-700/50 text-surface-400'
      } ${className}`}
    >
      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      <span>{isCompleted ? 'Daily Goal Met' : 'In Progress'}</span>
    </div>
  );
}
