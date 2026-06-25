import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { fetchHealth, fetchMe, googleOneTapLogin } from './api';
import { useGoogleOneTap } from './hooks/useGoogleOneTap';
import { prefersReducedMotion } from './lib/motion';
import { DictionaryCard, DictionaryEntryPage } from './components/DictionaryCard';
import { ProfilePage } from './components/ProfilePage';
import { LandingPage } from './components/LandingPage';
import { type Theme, useTheme, resolveTheme } from './lib/theme';

const CourseDetailPage = lazy(() =>
  import('./components/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })),
);
const LibraryPage = lazy(() => import('./components/LibraryPage').then((m) => ({ default: m.LibraryPage })));
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
const DeckDetailPage = lazy(() =>
  import('./components/DecksPage').then((m) => ({ default: m.DeckDetailPage })),
);

/** Suspense fallback for lazy-loaded routes; announced to screen readers. */
function RouteLoading() {
  return <p aria-live="polite">Loading…</p>;
}



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

const MORE_PATHS = ['/known-words', '/profile'] as const;
const MORE_ITEMS = [
  { to: '/known-words', label: 'Known words', icon: '✓' },
  { to: '/profile',     label: 'Profile',      icon: '👤' },
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
      {MORE_ITEMS.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => itemClass(isActive)}>
          <span aria-hidden="true">{icon}</span>
          {label}
        </NavLink>
      ))}
      <div className="my-1 h-px w-full bg-surface-800/60" aria-hidden="true" />
      <button
        type="button"
        onClick={() => { setTheme(nextTheme); onClose(); }}
        className={itemClass(false)}
      >
        <span aria-hidden="true">{THEME_ICON[theme]}</span>
        {THEME_LABEL[theme]}
      </button>
    </div>
  );
}

/** Single nav that adapts to viewport: fixed bottom bar on mobile, in-flow pill row on desktop. */
function AppNav() {
  const { pathname } = useLocation();
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const navRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  // Mobile: vertical icon+label stack. Desktop: horizontal icon+label pill.
  const itemClass = (active: boolean) =>
    [
      'flex flex-col items-center gap-0.5 px-1 py-2 min-w-12 rounded-[1rem] transition-all',
      'md:flex-row md:gap-2 md:px-5 md:py-2.5 md:min-w-0 md:min-h-12 md:text-sm md:font-bold',
      active
        ? 'text-accent-indigo md:bg-surface-100 md:text-surface-950 md:shadow-sm md:-translate-y-0.5'
        : 'text-surface-500 md:text-surface-300 md:hover:bg-surface-700/50 md:hover:text-surface-100 md:hover:-translate-y-0.5',
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
            <img src="/logo.png" alt="Vocabahn" className="w-full h-full object-cover" />
          </Link>
        </div>

        <NavLink to="/" className={({ isActive }) => itemClass(isActive || pathname.startsWith('/dashboard'))}>
          <NavSvgIcon d={ICON_DASHBOARD} />
          <span className={labelClass}>Dashboard</span>
        </NavLink>

        <Link
          to="/dictionary"
          aria-current={dictionaryActive ? 'page' : undefined}
          className={itemClass(dictionaryActive)}
        >
          <NavSvgIcon d={ICON_DICT} />
          <span className={labelClass}>Dictionary</span>
        </Link>

        <NavLink to="/library" className={({ isActive }) => itemClass(isActive)}>
          <NavSvgIcon d={ICON_COURSES} />
          <span className={labelClass}>Library</span>
        </NavLink>

        {/* Review — FAB on mobile, icon-pill on desktop */}
        <NavLink
          to="/review"
          aria-label="Start review session"
          className={({ isActive }) =>
            [
              'flex flex-col items-center gap-0.5 px-1 -mt-4 py-2',
              'md:mt-0 md:flex-row md:gap-2 md:px-5 md:py-2.5 md:min-h-12 md:rounded-[1rem]',
              'md:transition-all md:text-sm md:font-bold',
              isActive
                ? 'md:bg-surface-50 md:text-surface-950 md:shadow-md md:-translate-y-0.5'
                : 'md:text-surface-300 md:hover:bg-surface-700/50 md:hover:text-surface-100 md:hover:-translate-y-0.5',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span className={`md:hidden flex size-12 items-center justify-center rounded-full shadow-lg transition-all ${
                isActive ? 'bg-surface-50 shadow-surface-50/40' : 'bg-surface-100 shadow-black/10 hover:scale-105'
              }`}>
                <NavSvgIcon d={ICON_REVIEW} className={isActive ? 'text-surface-950' : 'text-surface-950'} />
              </span>
              <NavSvgIcon d={ICON_REVIEW} className="hidden md:block" />
              <span className={`text-[10px] font-bold leading-none md:text-sm md:leading-normal ${
                isActive ? 'text-surface-50 md:text-surface-950' : 'text-surface-500 md:text-surface-300'
              }`}>Review</span>
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
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-[22px] rounded-full object-cover shadow-sm border border-surface-700/50" />
          ) : (
            <NavSvgIcon d={ICON_MORE} />
          )}
          <span className={labelClass}>Profile</span>
        </button>
      </nav>
    </>
  );
}



/** Maps the current path to a human-readable page name for titles and SPA-navigation announcements. */
function pageNameForPath(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/dictionary') || pathname.startsWith('/word/')) return 'Dictionary';
  if (pathname.startsWith('/courses')) return 'Courses';
  if (pathname.startsWith('/decks')) return 'Decks';
  if (pathname.startsWith('/review')) return 'Review';
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
    <NavLink to="/status" aria-label="System status" className="flex items-center justify-center p-2 opacity-20 hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded-full" title="System Status">
      <span
        role="img"
        aria-label={up ? 'up' : 'down'}
        className={`size-1.5 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}
      />
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


function GoogleOneTapPrompt() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: googleOneTapLogin,
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
    },
  });

  useGoogleOneTap({
    onSuccess: (credential) => mutation.mutate(credential),
  });

  return null;
}

export default function App() {
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const mainRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const currentActive = resolveTheme(theme);
        setTheme(currentActive === 'dark' ? 'light' : 'dark');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme, setTheme]);

  return (
    <>
      {!isPending && !user && <GoogleOneTapPrompt />}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-indigo-500 focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Skip to content
      </a>
      <RouteAnnouncer mainRef={mainRef} />
      <EdgeSwipeBack />
      
      {/* Global Awwwards-style Backgrounds */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Subtle Mesh Gradient Blobs */}
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vh] rounded-full bg-accent-indigo/10 blur-[120px]" />
        <div className="absolute top-[30%] right-[-10%] w-[40vw] h-[40vh] rounded-full bg-accent-emerald/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[60vw] h-[40vh] rounded-full bg-accent-amber/5 blur-[120px]" />
        
        {/* Noise Texture Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
        />
      </div>

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={`flex min-h-dvh flex-col items-center gap-6 ${user ? 'max-md:pb-mobile-nav md:pb-safe' : 'pb-safe'} text-surface-100 outline-none`}
      >
      {!isPending && !user && (
        <div className="w-full max-w-6xl space-y-10 mt-8 md:mt-16 px-4 xl:px-0">
          <LandingPage />
        </div>
      )}

      {user && (
        <>
          <AppNav />
          <div className="w-full max-w-6xl">
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/dictionary" element={<DictionaryCard />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/word/:word" element={<DictionaryEntryPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/courses" element={<Navigate to="/library" replace />} />
                <Route path="/courses/:slug" element={<CourseDetailPage />} />
                <Route path="/review" element={<ReviewSession />} />
                <Route path="/known-words" element={<KnownWordsPage />} />
                <Route path="/decks" element={<Navigate to="/library" replace />} />
                <Route path="/decks/:id" element={<DeckDetailPage />} />
                <Route path="/profile" element={<div className="mx-auto max-w-sm"><ProfilePage /></div>} />
                <Route path="/status" element={<div className="mx-auto max-w-sm"><StatusPage /></div>} />
              </Routes>
            </Suspense>
          </div>
        </>
      )}

      <footer className="mt-auto flex w-full max-w-6xl items-center justify-center gap-3 border-t border-surface-800 pt-4 pb-6 text-xs text-surface-500">
        <a
          href="https://github.com/YOUR_ORG/vocabahn/blob/main/docs/changelog.md"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-surface-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-colors"
        >
          v{__APP_VERSION__}
        </a>
        <StatusLink />
      </footer>

      </main>
    </>
  );
}
