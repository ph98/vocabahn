import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { BadgeCheck, BookOpen, CircleUserRound, HelpCircle, Monitor, Moon, Sun } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSessionUser } from '../hooks/useSession';
import { prefersReducedMotion, springSnappy } from '../lib/motion';
import { type Theme, useTheme } from '../lib/theme';

/**
 * The signed-in navigation, split out of `App.tsx` and loaded lazily.
 *
 * This file is the app's only eager consumer of `motion/react` and the shell's
 * only real consumer of GSAP — together ~100 kB gzipped. None of it can render
 * for a signed-out visitor, who is the one the landing page's numbers are
 * about, so it has no business in the entry chunk. `App.tsx` renders it inside
 * the same `signedIn` branch as the route table, behind a `Suspense` whose
 * fallback reserves the nav's height.
 */

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark'];
const THEME_ICON: Record<Theme, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};
const THEME_LABEL: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };

function NavSvgIcon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-[22px] ${className}`}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ICON_DICT = 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253';
const ICON_COURSES = 'M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.63 48.63 0 0112 20.904a48.63 48.63 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5';
const ICON_REVIEW = 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z';
const ICON_DASHBOARD = 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z';
const ICON_MORE = 'M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z';

const MORE_PATHS = ['/story', '/known-words', '/help', '/profile'] as const;
const MORE_ITEMS = [
  { to: '/story',       label: 'Story',         icon: BookOpen },
  { to: '/known-words', label: 'Known words', icon: BadgeCheck },
  { to: '/help',        label: 'Help & Guide', icon: HelpCircle },
  { to: '/profile',     label: 'Profile',      icon: CircleUserRound },
] as const;

function MorePanel({ onClose, buttonRef }: {
  onClose: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    if (!buttonRef.current) return;
    const btn = buttonRef.current.getBoundingClientRect();
    const right = Math.max(window.innerWidth - btn.right, 12);
    // If button is in the lower half of the viewport (mobile bottom nav), show above it.
    // Otherwise (desktop inline nav), show below it.
    setStyle(
      btn.top > window.innerHeight * 0.6
        ? { bottom: window.innerHeight - btn.top + 8, right, visibility: 'visible' }
        : { top: btn.bottom + 8, right, visibility: 'visible' },
    );
  }, [buttonRef]);

  useGSAP(() => {
    if (prefersReducedMotion() || style.visibility !== 'visible') return;
    gsap.from(ref.current, { y: 10, opacity: 0, duration: 0.2, ease: 'power2.out' });
  }, { scope: ref, dependencies: [style.visibility] });

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-3 min-h-11 w-full text-sm font-medium text-left transition-colors ${
      active ? 'bg-indigo-500/15 text-accent-indigo' : 'text-surface-300 hover:bg-surface-800'
    }`;

  const nextTheme = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length] ?? 'system';

  return (
    <div
      ref={ref}
      aria-label="Additional navigation"
      className="fixed z-50 w-52 flex flex-col gap-1 rounded-2xl border border-surface-700/80 bg-surface-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-md"
      style={style}
    >
      {MORE_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => itemClass(isActive)}>
          <Icon aria-hidden className="size-4" />
          {label}
        </NavLink>
      ))}
      <div className="my-1 h-px w-full bg-surface-800/60" aria-hidden="true" />
      <button
        type="button"
        onClick={() => { setTheme(nextTheme); onClose(); }}
        className={itemClass(false)}
      >
        {(() => { const ThemeIcon = THEME_ICON[theme]; return <ThemeIcon aria-hidden className="size-4" />; })()}
        {THEME_LABEL[theme]}
      </button>
    </div>
  );
}

/** Single nav that adapts to viewport: fixed bottom bar on mobile, in-flow pill row on desktop. */
export function AppNav() {
  const { pathname } = useLocation();
  const user = useSessionUser();
  const navRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const logoMarkRef = useRef<HTMLImageElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const dictionaryActive = pathname.startsWith('/dictionary') || pathname.startsWith('/word/');
  const moreActive = MORE_PATHS.some((p) => pathname.startsWith(p));

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      navRef.current,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.15, clearProps: 'y,opacity' },
    );
  }, { scope: navRef });

  useGSAP(() => {
    if (prefersReducedMotion() || !logoMarkRef.current) return;
    gsap.to(logoMarkRef.current, {
      rotation: 360,
      duration: 25,
      repeat: -1,
      ease: 'none',
    });
  }, { scope: logoMarkRef });

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  // Mobile: vertical icon+label stack. Desktop: horizontal icon+label pill.
  const itemClass = (active: boolean) =>
    [
      'relative flex flex-col items-center gap-0.5 px-1 py-2 min-w-12 rounded-[1rem] transition-all active:scale-95 md:active:scale-100',
      'md:flex-row md:gap-2 md:px-5 md:py-2.5 md:min-w-0 md:min-h-12 md:text-sm md:font-bold',
      active
        ? 'text-accent-indigo md:bg-surface-100 md:text-surface-950 md:shadow-sm md:-translate-y-0.5'
        : 'text-surface-500 md:text-surface-300 md:hover:bg-surface-700/50 md:hover:text-surface-100 md:hover:-translate-y-0.5',
    ].join(' ');

  const labelClass = 'text-[10px] font-medium leading-none md:text-sm md:leading-normal';

  // Slides between the active tab's slot on mobile (hidden on desktop, where
  // the pill background communicates the active state instead).
  const activeIndicator = (
    <motion.span
      layoutId="mobile-nav-indicator"
      transition={springSnappy}
      aria-hidden="true"
      className="absolute -top-px left-0 right-0 mx-auto h-0.5 w-8 rounded-full bg-accent-indigo md:hidden"
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      {moreOpen && (
        <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setMoreOpen(false)} />
      )}
      {moreOpen && <MorePanel onClose={() => setMoreOpen(false)} buttonRef={moreButtonRef} />}

      <nav
        ref={navRef}
        aria-label="Main"
        className={[
          // Mobile: fixed bottom bar
          'fixed bottom-0 inset-x-0 z-50 flex items-center justify-around',
          'border-t border-surface-800/40 bg-surface-950/80 backdrop-blur-2xl pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]',
          // Desktop: in-flow pill row
          'md:relative md:bottom-auto md:inset-x-auto md:z-auto md:w-full md:max-w-6xl',
          'md:mt-8 md:mb-6 md:justify-start md:gap-2 md:rounded-[1.5rem] md:border md:border-surface-700/50',
          'md:bg-surface-800/40 md:p-2 md:shadow-premium md:backdrop-blur-xl md:pb-2',
        ].join(' ')}
      >
        {/* Desktop Branding Icon */}
        <div className="hidden md:flex items-center pl-2 pr-3 border-r border-surface-800/50 mr-1">
          <Link
            to="/"
            aria-label="Vocabahn Home"
            className="flex items-center justify-center size-8 rounded-full bg-surface-900 shadow-sm border border-surface-700/50 select-none group transition-all hover:scale-105 hover:border-accent-indigo/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white overflow-hidden"
          >
            <img ref={logoMarkRef} src="/logo.png" alt="Vocabahn" width={800} height={240} className="w-full h-full object-cover" />
          </Link>
        </div>

        <NavLink to="/" className={({ isActive }) => itemClass(isActive || pathname.startsWith('/dashboard'))}>
          {({ isActive }) => (
            <>
              {(isActive || pathname.startsWith('/dashboard')) && activeIndicator}
              <NavSvgIcon d={ICON_DASHBOARD} />
              <span className={labelClass}>Dashboard</span>
            </>
          )}
        </NavLink>

        <Link
          to="/dictionary"
          aria-current={dictionaryActive ? 'page' : undefined}
          className={itemClass(dictionaryActive)}
        >
          {dictionaryActive && activeIndicator}
          <NavSvgIcon d={ICON_DICT} />
          <span className={labelClass}>Dictionary</span>
        </Link>

        {/* Review — centered FAB on mobile, icon-pill on desktop */}
        <NavLink
          to="/review"
          aria-label="Start review session"
          className={({ isActive }) =>
            [
              'relative flex flex-col items-center gap-1 px-1 -mt-5 py-2 min-w-12 active:scale-95 md:active:scale-100',
              'md:mt-0 md:flex-row md:gap-2 md:px-5 md:py-2.5 md:min-h-12 md:min-w-0 md:rounded-[1rem]',
              'md:transition-all md:text-sm md:font-bold',
              isActive
                ? 'md:bg-surface-100 md:text-surface-950 md:shadow-sm md:-translate-y-0.5'
                : 'md:text-surface-300 md:hover:bg-surface-700/50 md:hover:text-surface-100 md:hover:-translate-y-0.5',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`md:hidden flex size-13 items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/30 ring-4 ring-surface-950/80 transition-colors ${
                  isActive ? 'bg-indigo-400' : 'bg-indigo-500'
                }`}
              >
                <NavSvgIcon d={ICON_REVIEW} />
              </span>
              <NavSvgIcon d={ICON_REVIEW} className="hidden md:block" />
              <span
                className={`${labelClass} md:font-bold ${
                  isActive ? 'text-accent-indigo md:text-surface-950' : 'text-surface-500 md:text-surface-300'
                }`}
              >
                Review
              </span>
            </>
          )}
        </NavLink>

        <NavLink to="/library" className={({ isActive }) => itemClass(isActive)}>
          {({ isActive }) => (
            <>
              {isActive && activeIndicator}
              <NavSvgIcon d={ICON_COURSES} />
              <span className={labelClass}>Library</span>
            </>
          )}
        </NavLink>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-haspopup="true"
          aria-label="Profile navigation options"
          className={itemClass(moreActive || moreOpen)}
        >
          {moreActive && activeIndicator}
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-[22px] rounded-full object-cover shadow-sm border border-surface-700/50" />
          ) : (
            <NavSvgIcon d={ICON_MORE} />
          )}
          <span className={labelClass}>Profile</span>
        </button>
      </nav>
    </MotionConfig>
  );
}
