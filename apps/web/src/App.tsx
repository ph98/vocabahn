import { useQuery } from '@tanstack/react-query';
import gsap from 'gsap';
import { lazy, Suspense, useEffect, useRef, type RefObject } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { fetchHealth, fetchMe } from './api';
import { prefersReducedMotion } from './lib/motion';
import { DictionaryCard, DictionaryEntryPage } from './components/DictionaryCard';
import { ProfilePage } from './components/ProfilePage';
import { type Theme, useTheme } from './lib/theme';

const CourseDetailPage = lazy(() =>
  import('./components/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })),
);
const CoursesPage = lazy(() => import('./components/CoursesPage').then((m) => ({ default: m.CoursesPage })));
const DashboardPage = lazy(() =>
  import('./components/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const KnownWordsPage = lazy(() =>
  import('./components/KnownWordsPage').then((m) => ({ default: m.KnownWordsPage })),
);
const ReviewSession = lazy(() =>
  import('./components/ReviewSession').then((m) => ({ default: m.ReviewSession })),
);
const StatusPage = lazy(() => import('./components/StatusPage').then((m) => ({ default: m.StatusPage })));

/** Suspense fallback for lazy-loaded routes; announced to screen readers. */
function RouteLoading() {
  return <p aria-live="polite">Loading…</p>;
}

const navLinkClass = (isActive: boolean) =>
  `min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
    isActive
      ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-950/50'
      : 'text-surface-300 hover:bg-surface-800'
  }`;

const navLinkClassName = ({ isActive }: { isActive: boolean }) => navLinkClass(isActive);

const iconLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
    isActive ? 'border-indigo-400' : 'border-surface-800 hover:border-surface-600'
  }`;

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark'];
const THEME_ICON: Record<Theme, string> = { system: '🖥️', light: '☀️', dark: '🌙' };
const THEME_LABEL: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };

/** Cycles the persisted theme preference (system → light → dark → system). */
function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length] ?? 'system';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${THEME_LABEL[theme]} active. Switch to ${THEME_LABEL[next].toLowerCase()}.`}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-surface-800 text-lg transition-colors hover:border-surface-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span aria-hidden="true">{THEME_ICON[theme]}</span>
    </button>
  );
}

/** Maps the current path to a human-readable page name for titles and SPA-navigation announcements. */
function pageNameForPath(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/word/')) return 'Dictionary';
  if (pathname.startsWith('/courses')) return 'Courses';
  if (pathname.startsWith('/review')) return 'Review';
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/known-words')) return 'Known words';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/status')) return 'System status';
  return 'Vocabahn';
}

/**
 * On SPA route changes, updates the document title, announces the new page
 * to screen readers, and moves focus to the main landmark so keyboard and
 * AT users get the same "new page" signal a full navigation would give.
 */
function RouteAnnouncer({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const pageName = pageNameForPath(pathname);

  useEffect(() => {
    document.title = pageName === 'Dictionary' ? 'Vocabahn' : `${pageName} — Vocabahn`;
    mainRef.current?.focus();
  }, [pathname, pageName, mainRef]);

  return (
    <p aria-live="polite" className="sr-only">
      {pageName}
    </p>
  );
}

function Nav() {
  const { pathname } = useLocation();
  const dictionaryActive = pathname === '/' || pathname.startsWith('/word/');

  return (
    <nav
      aria-label="Main"
      className="flex w-full max-w-2xl flex-wrap justify-center gap-2 rounded-2xl border border-surface-800 bg-surface-900 p-2 shadow-lg shadow-black/20"
    >
      <Link to="/" className={navLinkClass(dictionaryActive)}>
        Dictionary
      </Link>
      <NavLink to="/courses" className={navLinkClassName}>
        Courses
      </NavLink>
      <NavLink to="/review" className={navLinkClassName}>
        Review
      </NavLink>
      <NavLink to="/dashboard" className={navLinkClassName}>
        Dashboard
      </NavLink>
      <NavLink to="/known-words" className={navLinkClassName}>
        Known words
      </NavLink>
    </nav>
  );
}

/** Small status dot reflecting overall API/db/redis health, linking to /status. */
function StatusLink() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });
  const up = !isError && data?.services.database === 'up' && data?.services.redis === 'up';

  return (
    <NavLink to="/status" aria-label="System status" className={iconLinkClassName}>
      <span
        role="img"
        aria-label={up ? 'up' : 'down'}
        className={`size-2.5 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
      />
    </NavLink>
  );
}

/** Small avatar (or placeholder) linking to /profile. */
function ProfileLink() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  return (
    <NavLink to="/profile" aria-label="Profile" className={iconLinkClassName}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full rounded-full" />
      ) : (
        <span aria-hidden="true">👤</span>
      )}
    </NavLink>
  );
}

/**
 * Invisible left-edge detector that triggers navigate(-1) on a right-swipe
 * starting within 24 px of the left edge. Disabled on /review so it doesn't
 * conflict with the card's own swipe-to-rate gesture.
 */
function EdgeSwipeBack() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname.startsWith('/review')) return;

    let startX = 0;
    let startY = 0;
    let active = false;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      active = startX < 24;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || !indicatorRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dy > dx || dy > 40) { active = false; return; }
      const tx = Math.min(Math.max(dx * 0.55, 0), 72);
      const opacity = Math.min(tx / 60, 0.9);
      if (prefersReducedMotion()) return;
      gsap.set(indicatorRef.current, { x: tx - 40, opacity });
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const touch = e.changedTouches[0];
      if (indicatorRef.current) gsap.to(indicatorRef.current, { x: -40, opacity: 0, duration: 0.2 });
      if (!touch) return;
      if (touch.clientX - startX > 80) navigate(-1);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [pathname, navigate]);

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-1/2 z-50 flex h-10 w-10 -translate-x-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface-900 text-surface-100 opacity-0 shadow-lg ring-1 ring-surface-800"
    >
      ‹
    </div>
  );
}

export default function App() {
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const mainRef = useRef<HTMLElement>(null);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-indigo-500 focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Skip to content
      </a>
      <RouteAnnouncer mainRef={mainRef} />
      <EdgeSwipeBack />
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="flex min-h-dvh flex-col items-center gap-6 bg-surface-950 px-safe pt-safe pb-safe text-surface-100 outline-none"
      >
      <header className="flex w-full max-w-2xl items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Vocab<span className="text-accent-indigo">ahn</span>
          </h1>
          <p className="mt-2 text-surface-400">
            German vocabulary, <span lang="de">Wort für Wort</span>.
          </p>
        </div>
        {!isPending && (
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <StatusLink />
            <ProfileLink />
          </div>
        )}
      </header>

      {!isPending && !user && (
        <div className="w-full max-w-sm">
          <ProfilePage />
        </div>
      )}

      {user && (
        <>
          <Nav />
          <div className="w-full max-w-2xl">
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<DictionaryCard />} />
                <Route path="/word/:word" element={<DictionaryEntryPage />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/courses/:slug" element={<CourseDetailPage />} />
                <Route path="/review" element={<ReviewSession />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/known-words" element={<KnownWordsPage />} />
                <Route path="/profile" element={<div className="mx-auto max-w-sm"><ProfilePage /></div>} />
                <Route path="/status" element={<div className="mx-auto max-w-sm"><StatusPage /></div>} />
              </Routes>
            </Suspense>
          </div>
        </>
      )}

      </main>
    </>
  );
}
