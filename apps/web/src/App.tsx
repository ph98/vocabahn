import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { BadgeCheck, BookOpen, CircleUserRound, HelpCircle, Monitor, Moon, Sun } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { lazy, useEffect, useRef, useState, type ComponentType, type RefObject } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiUnavailableError, fetchAuthConfig, googleOneTapLogin } from './api';
import { useGoogleOneTap } from './hooks/useGoogleOneTap';
import { HEALTH_POLL_INTERVAL_MS, useHealthPoll, useHealthSignal } from './hooks/useHealth';
import { useSession, useSessionUser } from './hooks/useSession';
import { prefersReducedMotion, springSnappy } from './lib/motion';
import { DictionaryCard, DictionaryEntryPage } from './components/DictionaryCard';
import { ProfilePage } from './components/ProfilePage';
import { LandingPage } from './components/LandingPage';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { ToastProvider } from './components/Toast';
import {
  ErrorStateForError,
  OfflineState,
  RouteBoundary,
  ServerUnreachableState,
} from './components/errors';
import { type Theme, useTheme, resolveTheme } from './lib/theme';
import { trackPageView, trackEvent, markPendingLogin, flushPendingLogin } from './lib/telemetry';

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
const HelpPage = lazy(() => import('./components/HelpPage').then((m) => ({ default: m.HelpPage })));
const ReviewSession = lazy(() =>
  import('./components/ReviewSession').then((m) => ({ default: m.ReviewSession })),
);
const StoryPage = lazy(() => import('./components/StoryPage').then((m) => ({ default: m.StoryPage })));
const StatusPage = lazy(() => import('./components/StatusPage').then((m) => ({ default: m.StatusPage })));
const DeckDetailPage = lazy(() =>
  import('./components/DecksPage').then((m) => ({ default: m.DeckDetailPage })),
);
const TermsPage = lazy(() => import('./components/TermsPage').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const NotFoundPage = lazy(() =>
  import('./components/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

function GoogleOneTapPrompt() {
  const queryClient = useQueryClient();
  const { data: authConfig } = useQuery({
    queryKey: ['authConfig'],
    queryFn: fetchAuthConfig,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: googleOneTapLogin,
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      // One Tap is the only sign-in the SPA can watch succeed without a page
      // load, so it reports `login` directly instead of via the marker below.
      trackEvent('login', { method: 'google_one_tap' });
    },
  });

  useGoogleOneTap({
    clientId: authConfig?.googleClientId,
    onSuccess: (credential) => mutation.mutate(credential),
  });

  return null;
}

function AuthVerifyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      // The API verifies, sets cookies and redirects back here; leaving a
      // marker is the only way the returning load can know a sign-in just
      // happened rather than a cookie simply still being valid.
      markPendingLogin('email_link');
      window.location.replace(`/api/v1/auth/email/verify?token=${encodeURIComponent(token)}`);
    } else {
      window.location.replace('/?auth_error=invalid_link');
    }
  }, [token]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
      <div className="size-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" aria-hidden="true" />
      <p className="text-surface-300 font-medium" aria-live="polite">Verifying your sign-in link…</p>
    </div>
  );
}

function AuthErrorBanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const errorType = searchParams.get('auth_error');

  if (!errorType) return null;

  const messages: Record<string, string> = {
    state: 'Sign-in session expired or state mismatch. Please try signing in again.',
    google: 'Google authentication failed. Please try again.',
    invalid_link: 'The sign-in link is invalid or has expired.',
  };

  const message = messages[errorType] || 'Authentication error occurred. Please try again.';

  return (
    <div
      role="alert"
      className="w-full max-w-xl mx-auto my-4 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-lg backdrop-blur-md"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => {
          searchParams.delete('auth_error');
          setSearchParams(searchParams, { replace: true });
        }}
        className="ml-3 font-semibold text-red-300 hover:text-white transition-colors"
        aria-label="Dismiss error"
      >
        Dismiss
      </button>
    </div>
  );
}



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
function AppNav() {
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
            <img ref={logoMarkRef} src="/logo.png" alt="Vocabahn" className="w-full h-full object-cover" />
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



/** Maps the current path to a human-readable page name for titles and SPA-navigation announcements. */
function pageNameForPath(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/dictionary') || pathname.startsWith('/word/')) return 'Dictionary';
  if (pathname.startsWith('/courses')) return 'Courses';
  if (pathname.startsWith('/decks')) return 'Decks';
  if (pathname.startsWith('/review')) return 'Review';
  if (pathname.startsWith('/story')) return 'Story';
  if (pathname.startsWith('/known-words')) return 'Known words';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/privacy')) return 'Privacy Policy';
  if (pathname.startsWith('/status')) return 'System status';
  if (pathname.startsWith('/terms')) return 'Terms of Service';
  if (pathname.startsWith('/privacy')) return 'Privacy Policy';
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
    const title = pageName === 'Dictionary' ? 'Vocabahn' : `${pageName} — Vocabahn`;
    document.title = title;
    mainRef.current?.focus();
    trackPageView(pathname, title);
  }, [pathname, pageName, mainRef]);

  return (
    <p aria-live="polite" className="sr-only">
      {pageName}
    </p>
  );
}

/** Shared styling for every footer link, so a new one cannot drift from the rest. */
const footerLinkClass =
  'hover:text-surface-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-colors';

/**
 * GitHub mark. lucide-react dropped its brand icons in v1, so this is inlined
 * rather than pulling in a second icon dependency for a single glyph.
 */
function GitHubMark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor" {...props}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/**
 * Small status dot reflecting overall API/db/redis health, linking to /status.
 *
 * It sits in the footer, outside every auth branch, so its poll keeps running
 * during an outage — which is what {@link SessionUnavailable} rides on to bring
 * the app back without a second polling loop.
 */
function StatusLink() {
  const { data, isError } = useHealthPoll();
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
 * What the shell shows when it cannot tell whether anyone is signed in.
 *
 * Deliberately not a sign-in prompt and not the landing page: the session
 * cookie is untouched, so nothing here clears client state and the app comes
 * back on whatever route the user was already on. Recovery rides on the
 * footer's `/health` poll — when the API starts answering again, the session is
 * re-checked once — rather than adding a second loop against a struggling API.
 */
function SessionUnavailable({
  error,
  isChecking,
  onRetry,
}: {
  error: unknown;
  isChecking: boolean;
  onRetry: () => void;
}) {
  const health = useHealthSignal();
  const apiAnswered = health.isSuccess;
  const wasAnswering = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (apiAnswered && !wasAnswering.current) onRetry();
    wasAnswering.current = apiAnswered;
  }, [apiAnswered, onRetry]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // A failure that is not an outage — a response we could not parse, say — gets
  // the state that actually describes it rather than a comforting lie.
  if (!(error instanceof ApiUnavailableError)) {
    return <ErrorStateForError error={error} onRetry={onRetry} />;
  }

  const lastCheckedAt = Math.max(health.dataUpdatedAt, health.errorUpdatedAt);
  const retryInSeconds = lastCheckedAt
    ? Math.ceil((lastCheckedAt + HEALTH_POLL_INTERVAL_MS - now) / 1000)
    : null;

  return (
    <ServerUnreachableState
      isRetrying={isChecking || health.isFetching}
      retryInSeconds={retryInSeconds}
      autoRetrying
      onRetry={onRetry}
    />
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
  const session = useSession();
  const signedIn = session.status === 'authenticated';
  const mainRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useTheme();

  // A redirect sign-in (Google OAuth, magic link) completes with a full page
  // load, so `login` is reported here, once a session actually exists.
  useEffect(() => {
    if (signedIn) flushPendingLogin();
  }, [signedIn]);

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
    <ToastProvider>
      {/* Only when the API has actually said there is no session — never while
          it is simply not answering, which would ask a signed-in user to sign
          in again. */}
      {session.status === 'anonymous' && <GoogleOneTapPrompt />}
      <CookieConsentBanner />
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
        className={`flex min-h-dvh flex-col items-center gap-6 ${signedIn ? 'max-md:pb-mobile-nav md:pb-safe' : 'pb-safe'} text-surface-100 outline-none`}
      >
        <AuthErrorBanner />
        {session.status === 'anonymous' && (
        <div className="w-full max-w-6xl space-y-10 mt-8 md:mt-16 px-4 xl:px-0">
          <RouteBoundary>
            <Routes>
              <Route path="/auth/verify" element={<AuthVerifyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<LandingPage />} />
            </Routes>
          </RouteBoundary>
        </div>
      )}

      {/* The API could not tell us who this is. The routes stay unmounted, but
          so does the landing page — nothing about the session has been lost. */}
      {session.status === 'unreachable' && (
        <div className="w-full max-w-6xl px-4 xl:px-0">
          <SessionUnavailable error={session.error} isChecking={session.isChecking} onRetry={session.recheck} />
        </div>
      )}

      {/* No connection and no user we have met before: the device is the
          problem, and the advice is different from an outage's. */}
      {session.status === 'offline' && (
        <div className="w-full max-w-6xl px-4 xl:px-0">
          <OfflineState onRetry={session.recheck} />
        </div>
      )}

      {signedIn && (
        <>
          <AppNav />
          <div className="w-full max-w-6xl">
            <RouteBoundary>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/dictionary" element={<DictionaryCard />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/word/:word" element={<DictionaryEntryPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/courses" element={<Navigate to="/library" replace />} />
                <Route path="/courses/:slug" element={<CourseDetailPage />} />
                <Route path="/review" element={<ReviewSession />} />
                <Route path="/story" element={<StoryPage />} />
                <Route path="/known-words" element={<KnownWordsPage />} />
                <Route path="/decks" element={<Navigate to="/library" replace />} />
                <Route path="/decks/:id" element={<DeckDetailPage />} />
                <Route path="/profile" element={<div className="mx-auto max-w-sm"><ProfilePage /></div>} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/guide" element={<Navigate to="/help" replace />} />
                <Route path="/status" element={<div className="mx-auto max-w-sm"><StatusPage /></div>} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/auth/verify" element={<AuthVerifyPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </RouteBoundary>
          </div>
        </>
      )}

      <footer className="mt-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-surface-800 pt-4 pb-6 text-xs text-surface-500">
        <Link to="/help" className={`${footerLinkClass} font-medium text-surface-400`}>
          Help &amp; User Guide
        </Link>
        <span aria-hidden="true">•</span>
        <a
          href="https://github.com/ph98/vocabahn/blob/main/docs/changelog.md"
          target="_blank"
          rel="noopener noreferrer"
          className={footerLinkClass}
        >
          v{__APP_VERSION__}
        </a>
        <span aria-hidden="true">•</span>
        <Link to="/terms" className={footerLinkClass}>
          Terms
        </Link>
        <span aria-hidden="true">•</span>
        <Link to="/privacy" className={footerLinkClass}>
          Privacy Policy
        </Link>
        <span aria-hidden="true">•</span>
        {/*
          "Source on GitHub", not "open source": the project is licensed
          PolyForm Noncommercial 1.0.0, which forbids commercial use and is not
          OSI-approved. The wording has to match the LICENSE file.
        */}
        <a
          href="https://github.com/ph98/vocabahn"
          target="_blank"
          rel="noopener noreferrer"
          className={`${footerLinkClass} inline-flex items-center gap-1.5`}
        >
          <GitHubMark className="size-3.5" />
          Source on GitHub
        </a>
        <span aria-hidden="true">•</span>
        <StatusLink />
      </footer>

      </main>
    </ToastProvider>
  );
}
