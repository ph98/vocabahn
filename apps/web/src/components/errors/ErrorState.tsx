import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type ErrorTone = 'neutral' | 'warning' | 'danger';

const TONE_ICON: Record<ErrorTone, string> = {
  neutral: 'text-accent-indigo',
  warning: 'text-accent-amber',
  danger: 'text-accent-red',
};

export interface ErrorStateProps {
  icon: LucideIcon;
  /** Short eyebrow above the heading — a status code or category. Never the headline itself. */
  code?: string;
  /** Plain language: what happened. */
  title: string;
  /** Plain language: what it means and what to do next. */
  description: ReactNode;
  /** At least one real way out. Compose with {@link ErrorAction}. */
  actions?: ReactNode;
  /** A stable sentence about ongoing activity (e.g. "Checking again automatically"), announced politely. */
  status?: ReactNode;
  /** Small footnote for traceable detail — a Sentry event id, an error message. */
  footnote?: ReactNode;
  tone?: ErrorTone;
  /** Compact card for a panel that failed inside an otherwise working page. */
  inline?: boolean;
  /** Shows a ring spinner on the icon while something is being retried. */
  busy?: boolean;
}

/**
 * The one error presentation in the app: rounded icon tile, optional code,
 * heading, muted explanation, actions.
 *
 * The full-page form renders an `<h1>` and moves focus to it on mount, so a
 * screen-reader user is told what happened rather than landing in silence.
 *
 * The entrance is the CSS `.vb-fade-in` in `index.css`, not a GSAP hook. This
 * component is reachable from the app shell — `AppErrorBoundary` wraps the
 * whole tree, and the auth gate renders `ServerUnreachableState` directly — so
 * anything it imports is in the entry chunk, and a GSAP import here alone was
 * enough to put the animation library on a signed-out visitor's critical path.
 * The `key` replays the entrance when the state being shown changes, which is
 * what the hook's dependency array used to do. Same `prefers-reduced-motion`
 * contract: the CSS rule is switched off there, and nothing animates
 * unconditionally.
 */
export function ErrorState({
  icon: Icon,
  code,
  title,
  description,
  actions,
  status,
  footnote,
  tone = 'neutral',
  inline = false,
  busy = false,
}: ErrorStateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (inline) return;
    headingRef.current?.focus();
  }, [inline, title]);

  if (inline) {
    return (
      <div
        key={title}
        ref={rootRef}
        role="status"
        className="vb-fade-in flex w-full items-start gap-3 rounded-2xl border border-surface-800 bg-surface-900/60 p-4 text-left"
      >
        <span
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-800 ${TONE_ICON[tone]}`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-surface-100">{title}</h2>
          <div className="mt-1 text-sm text-surface-400">{description}</div>
          {status && <p className="mt-1 text-xs text-surface-500">{status}</p>}
          {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
          {footnote && <p className="mt-3 break-words font-mono text-xs text-surface-500">{footnote}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      key={title}
      ref={rootRef}
      className="vb-fade-in flex min-h-[60vh] w-full flex-col items-center justify-center px-4 py-12 text-center"
    >
      <div
        className={`relative mb-6 flex size-20 items-center justify-center rounded-3xl border border-surface-700/60 bg-surface-800/80 shadow-xl backdrop-blur-xl ${TONE_ICON[tone]}`}
      >
        <Icon className="size-10" aria-hidden="true" />
        {busy && (
          <span
            aria-hidden="true"
            className="absolute -inset-1 rounded-[1.75rem] border-2 border-current border-t-transparent opacity-60 motion-safe:animate-spin"
          />
        )}
      </div>
      {code && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-surface-500">{code}</p>
      )}
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mb-3 text-3xl font-extrabold tracking-tight text-surface-100 outline-none sm:text-4xl"
      >
        {title}
      </h1>
      <div className="mb-6 max-w-md text-base leading-relaxed text-surface-400">{description}</div>
      {status && (
        <p role="status" className="-mt-2 mb-6 text-sm text-surface-400">
          {status}
        </p>
      )}
      {actions && <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      {footnote && (
        <p className="mt-8 max-w-md break-words font-mono text-xs text-surface-500">{footnote}</p>
      )}
    </div>
  );
}

const ACTION_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

const ACTION_VARIANT = {
  primary: 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-600',
  secondary: 'border border-surface-700 text-surface-200 hover:border-surface-600 hover:bg-surface-800',
} as const;

export interface ErrorActionProps {
  /** In-app destination. Renders a router `Link`. */
  to?: string;
  /** External destination. Renders an `<a>`. */
  href?: string;
  /** Renders a `<button>`. Ignored when `to` or `href` is given. */
  onClick?: () => void;
  icon?: LucideIcon;
  variant?: keyof typeof ACTION_VARIANT;
  disabled?: boolean;
  children: ReactNode;
}

/** A way out of an error state: link or button, both ≥44 px with a visible focus ring. */
export function ErrorAction({
  to,
  href,
  onClick,
  icon: Icon,
  variant = 'secondary',
  disabled = false,
  children,
}: ErrorActionProps) {
  const className = `${ACTION_BASE} ${ACTION_VARIANT[variant]}`;
  const content = (
    <>
      {Icon && <Icon className="size-5" aria-hidden="true" />}
      <span>{children}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={className} rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {content}
    </button>
  );
}
