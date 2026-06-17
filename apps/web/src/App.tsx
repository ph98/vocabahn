import { useQuery } from '@tanstack/react-query';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { fetchHealth, fetchMe } from './api';
import { prefersReducedMotion } from './lib/motion';
import { DictionaryCard, DictionaryEntryPage } from './components/DictionaryCard';
import { IllustrationDictionary, IllustrationFlashcard, IllustrationStreak, IllustrationTrophy } from './components/Illustrations';
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
const DecksPage = lazy(() => import('./components/DecksPage').then((m) => ({ default: m.DecksPage })));
const DeckDetailPage = lazy(() =>
  import('./components/DecksPage').then((m) => ({ default: m.DeckDetailPage })),
);

/** Suspense fallback for lazy-loaded routes; announced to screen readers. */
function RouteLoading() {
  return <p aria-live="polite">Loading…</p>;
}

const iconLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
    isActive ? 'border-indigo-400' : 'border-surface-800 hover:border-surface-600'
  }`;

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark'];
const THEME_ICON: Record<Theme, string> = { system: '🖥️', light: '☀️', dark: '🌙' };
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

const MORE_PATHS = ['/known-words', '/decks', '/profile', '/status'] as const;
const MORE_ITEMS = [
  { to: '/known-words', label: 'Known words', icon: '✓' },
  { to: '/decks',       label: 'Decks',        icon: '🗂' },
  { to: '/profile',     label: 'Profile',      icon: '👤' },
  { to: '/status',      label: 'System status', icon: '●' },
] as const;

function MorePanel({ onClose, buttonRef }: {
  onClose: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

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

  return (
    <div
      ref={ref}
      aria-label="Additional navigation"
      className="fixed z-50 w-48 rounded-2xl border border-surface-700/80 bg-surface-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-md"
      style={style}
    >
      {MORE_ITEMS.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => itemClass(isActive)}>
          <span aria-hidden="true">{icon}</span>
          {label}
        </NavLink>
      ))}
    </div>
  );
}

/** Single nav that adapts to viewport: fixed bottom bar on mobile, in-flow pill row on desktop. */
function AppNav() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const dictionaryActive = pathname === '/' || pathname.startsWith('/word/');
  const moreActive = MORE_PATHS.some((p) => pathname.startsWith(p));

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      navRef.current,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.15, clearProps: 'y,opacity' },
    );
  }, { scope: navRef });

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  // Mobile: vertical icon+label stack. Desktop: horizontal icon+label pill.
  const itemClass = (active: boolean) =>
    [
      'flex flex-col items-center gap-0.5 px-1 py-2 min-w-12 rounded-xl transition-colors',
      'md:flex-row md:gap-2 md:px-4 md:py-2.5 md:min-w-0 md:min-h-11 md:text-sm md:font-medium',
      active
        ? 'text-indigo-400 md:bg-indigo-500 md:text-white md:shadow-sm md:shadow-indigo-950/50'
        : 'text-surface-500 md:text-surface-300 md:hover:bg-surface-800',
    ].join(' ');

  const labelClass = 'text-[10px] font-medium leading-none md:text-sm md:leading-normal';

  return (
    <>
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
          'border-t border-surface-800 bg-surface-950/90 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]',
          // Desktop: in-flow pill row
          'md:relative md:bottom-auto md:inset-x-auto md:z-auto md:w-full md:max-w-2xl',
          'md:justify-start md:gap-1 md:rounded-2xl md:border md:border-surface-800',
          'md:bg-surface-900 md:p-2 md:shadow-lg md:shadow-black/20 md:backdrop-blur-none md:pb-0',
        ].join(' ')}
      >
        <Link
          to="/"
          aria-current={dictionaryActive ? 'page' : undefined}
          className={itemClass(dictionaryActive)}
        >
          <NavSvgIcon d={ICON_DICT} />
          <span className={labelClass}>Dictionary</span>
        </Link>

        <NavLink to="/courses" className={({ isActive }) => itemClass(isActive)}>
          <NavSvgIcon d={ICON_COURSES} />
          <span className={labelClass}>Courses</span>
        </NavLink>

        {/* Review — FAB on mobile, icon-pill on desktop */}
        <NavLink
          to="/review"
          aria-label="Start review session"
          className={({ isActive }) =>
            [
              'flex flex-col items-center gap-0.5 px-1 -mt-4 py-2',
              'md:mt-0 md:flex-row md:gap-2 md:px-4 md:py-2.5 md:min-h-11 md:rounded-xl',
              'md:transition-colors md:text-sm md:font-medium',
              isActive
                ? 'md:bg-indigo-500 md:text-white md:shadow-sm md:shadow-indigo-950/50'
                : 'md:text-surface-300 md:hover:bg-surface-800',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span className={`md:hidden flex size-12 items-center justify-center rounded-full shadow-lg transition-all ${
                isActive ? 'bg-indigo-400 shadow-indigo-400/40' : 'bg-indigo-500 shadow-indigo-500/30 hover:bg-indigo-400'
              }`}>
                <NavSvgIcon d={ICON_REVIEW} className="text-white" />
              </span>
              <NavSvgIcon d={ICON_REVIEW} className="hidden md:block" />
              <span className={`text-[10px] font-medium leading-none md:text-sm md:leading-normal ${
                isActive ? 'text-indigo-400 md:text-white' : 'text-surface-500 md:text-surface-300'
              }`}>Review</span>
            </>
          )}
        </NavLink>

        <NavLink to="/dashboard" className={({ isActive }) => itemClass(isActive)}>
          <NavSvgIcon d={ICON_DASHBOARD} />
          <span className={labelClass}>Dashboard</span>
        </NavLink>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-haspopup="true"
          aria-label="More navigation options"
          className={itemClass(moreActive || moreOpen)}
        >
          <NavSvgIcon d={ICON_MORE} />
          <span className={labelClass}>More</span>
        </button>
      </nav>
    </>
  );
}

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
  if (pathname.startsWith('/decks')) return 'Decks';
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

const FEATURES = [
  { Illus: IllustrationDictionary, title: 'AI-enriched dictionary', desc: 'Every German word comes with examples, images, audio, memory hooks, and level tags — all generated automatically.' },
  { Illus: IllustrationFlashcard, title: 'Spaced-repetition flashcards', desc: 'FSRS-powered scheduling surfaces cards at exactly the right moment so you review less and remember more.' },
  { Illus: IllustrationStreak, title: 'Progress you can see', desc: 'Streaks, a GitHub-style heatmap, and per-course stats keep you motivated on the journey from A1 to C1.' },
  { Illus: IllustrationTrophy, title: 'Feels native on mobile', desc: 'Install as a PWA. Swipe cards to rate, pull to refresh, study offline — it works like a native app, not a website.' },
];

/** Marketing section shown to unauthenticated visitors before they sign in. */
function LandingPage() {
  return (
    <div className="relative overflow-hidden w-full max-w-5xl mx-auto rounded-3xl border border-surface-800/60 bg-surface-900 shadow-2xl">
      {/* Animated Mesh Gradient Background */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500 blur-[100px] animate-[pulse_4s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-emerald-500 blur-[120px] animate-[pulse_5s_ease-in-out_infinite]" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 grid gap-12 p-8 md:grid-cols-2 md:items-center md:p-12">
        {/* Left Side: Hero Copy */}
        <section aria-labelledby="hero-heading" className="space-y-8">
          <IllustrationDictionary className="h-20 w-auto text-indigo-400" />
          <h2 id="hero-heading" className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-balance">
            Learn German, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">word by word.</span>
          </h2>
          <p className="text-lg text-surface-300 max-w-md">
            Vocabahn is a free, open-source German vocabulary app with an AI-enriched dictionary
            and FSRS spaced-repetition flashcards.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/profile"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-indigo-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Get started
            </Link>
          </div>
        </section>

        {/* Right Side: Features Bento Box */}
        <section aria-label="Features" className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ Illus, title, desc }, idx) => (
            <div
              key={title}
              className={`group relative overflow-hidden rounded-3xl border border-surface-700/50 bg-surface-800/30 p-6 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-indigo-500/30 hover:bg-surface-800/50 hover:shadow-xl hover:shadow-indigo-500/10 ${idx === 0 || idx === 3 ? 'sm:col-span-2' : ''}`}
            >
              <Illus className="mb-4 h-12 w-auto text-indigo-300 transition-transform group-hover:scale-105" />
              <h3 className="mb-1.5 font-semibold text-surface-100">{title}</h3>
              <p className="text-sm text-surface-400">{desc}</p>
            </div>
          ))}
        </section>
      </div>

      <section aria-label="Sign in" className="relative z-10 border-t border-surface-800/50 bg-surface-950/30 p-8 text-center backdrop-blur-md">
        <div className="mx-auto max-w-sm">
          <ProfilePage />
        </div>
      </section>
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
        className={`flex min-h-dvh flex-col items-center gap-6 bg-surface-950 px-safe pt-safe ${user ? 'max-md:pb-mobile-nav md:pb-safe' : 'pb-safe'} text-surface-100 outline-none`}
      >
      <header className="flex w-full max-w-2xl items-center justify-between gap-4">
        <div 
          className="group cursor-default" 
          onMouseEnter={(e) => {
            const bahn = e.currentTarget.querySelector('.bahn-text');
            const train = e.currentTarget.querySelector('.train-icon');
            if (bahn && train) {
              gsap.timeline()
                .to(train, { opacity: 1, x: 5, duration: 0.2, ease: "power2.out" })
                .to(bahn, { x: 5, color: '#818cf8', duration: 0.3, ease: "power2.out" }, "<")
                .to(train, { x: 0, opacity: 0, duration: 0.2, delay: 0.5 })
                .to(bahn, { x: 0, color: '#a5b4fc', duration: 0.3 }, "<");
            }
          }}
        >
          <h1 className="flex items-center text-4xl font-bold tracking-tight">
            <span>Voca</span>
            <span className="train-icon opacity-0 -ml-2 mr-1 text-2xl" aria-hidden="true">🚂</span>
            <span className="bahn-text text-accent-indigo transition-colors">bahn</span>
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
        <div className="w-full max-w-2xl space-y-10">
          <LandingPage />
        </div>
      )}

      {user && (
        <>
          <AppNav />
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
                <Route path="/decks" element={<DecksPage />} />
                <Route path="/decks/:id" element={<DeckDetailPage />} />
                <Route path="/profile" element={<div className="mx-auto max-w-sm"><ProfilePage /></div>} />
                <Route path="/status" element={<div className="mx-auto max-w-sm"><StatusPage /></div>} />
              </Routes>
            </Suspense>
          </div>
        </>
      )}

      <footer className="mt-auto w-full max-w-2xl border-t border-surface-800 pt-4 text-center text-xs text-surface-500">
        <a
          href="https://github.com/YOUR_ORG/vocabahn/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-surface-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          v{__APP_VERSION__}
        </a>
      </footer>

      </main>
    </>
  );
}
