interface CEFRBadgeProps {
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface LevelStyle {
  bg: string;
  text: string;
  border: string;
  glow: string;
}

const DEFAULT_STYLE: LevelStyle = {
  bg: 'bg-sky-500/15',
  text: 'text-sky-400',
  border: 'border-sky-500/40',
  glow: 'shadow-sky-500/20',
};

const LEVEL_COLORS: Record<string, LevelStyle> = {
  A1: DEFAULT_STYLE,
  A2: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/40', glow: 'shadow-cyan-500/20' },
  B1: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40', glow: 'shadow-emerald-500/20' },
  B2: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40', glow: 'shadow-amber-500/20' },
  C1: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/40', glow: 'shadow-indigo-500/20' },
  C2: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/40', glow: 'shadow-rose-500/20' },
};

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs rounded-md border stroke-1',
  md: 'px-3 py-1 text-sm font-bold rounded-lg border-1.5 shadow-sm',
  lg: 'px-4 py-1.5 text-base font-black rounded-xl border-2 shadow-md',
};

export function CEFRBadge({ level, size = 'md', className = '' }: CEFRBadgeProps) {
  const normLevel = level?.toUpperCase() || 'A1';
  const style: LevelStyle = LEVEL_COLORS[normLevel] ?? DEFAULT_STYLE;
  const sizeStyle = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-extrabold tracking-wider backdrop-blur-md transition-all duration-300 ${style.bg} ${style.text} ${style.border} ${style.glow} ${sizeStyle} ${className}`}
    >
      <svg
        className="w-3.5 h-3.5 mr-1 fill-current opacity-80"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-5.45 9-12V7l-9-5z" />
      </svg>
      {normLevel}
    </span>
  );
}
