import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiUnavailableError, fetchAuthConfig, googleOneTapLogin } from './api';
import { useGoogleOneTap } from './hooks/useGoogleOneTap';
import { HEALTH_POLL_INTERVAL_MS, useHealthPoll, useHealthSignal } from './hooks/useHealth';
import { useSession } from './hooks/useSession';
import { prefersReducedMotion } from './lib/motion';
import { LandingPage } from './components/LandingPage';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { ProductFeedbackTrigger } from './components/ProductFeedbackTrigger';
import { ToastProvider } from './components/Toast';
import {
  ErrorStateForError,
  OfflineState,
  RouteBoundary,
  ServerUnreachableState,
} from './components/errors';
import { useTheme, resolveTheme } from './lib/theme';
import { trackPageView, trackEvent, markPendingLogin, flushPendingLogin } from './lib/telemetry';

/**
 * Everything below renders only for a signed-in user, so none of it belongs in
 * the chunk a signed-out visitor downloads before the landing page can paint.
 *
 * `AppNav` is lazy for that reason and not because it is a route: it is the
 * app's only eager consumer of `motion/react`. `DictionaryCard` is lazy because
 * it is 1199 lines and was eagerly imported for a route the landing page cannot
 * reach; `ProfilePage` likewise, now that `SignInOptions` — the one part of it
 * the landing page actually renders — lives in its own module.
 *
 * `LandingPage` stays eager. It *is* the signed-out page, and making it lazy
 * would only add a round trip in front of the paint this work is about.
 */
const AppNav = lazy(() => import('./components/AppNav').then((m) => ({ default: m.AppNav })));
const DictionaryCard = lazy(() =>
  import('./components/DictionaryCard').then((m) => ({ default: m.DictionaryCard })),
);
const DictionaryEntryPage = lazy(() =>
  import('./components/DictionaryCard').then((m) => ({ default: m.DictionaryEntryPage })),
);
const ProfilePage = lazy(() =>
  import('./components/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
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
  'hover:text-surface-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo transition-colors';

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
    <NavLink to="/status" aria-label="System status" className="flex items-center justify-center p-2 opacity-20 hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo rounded-full" title="System Status">
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
 *
 * The indicator is moved by writing `transform` and `opacity` straight onto the
 * node rather than through `gsap.set()`. It is two properties tracking a finger
 * — GSAP bought nothing here, and this component is mounted for every visitor
 * including the signed-out one, so importing an animation library for it put
 * ~230 kB on the landing page's critical path. The release is a CSS transition
 * on the element instead of `gsap.to()`.
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
      const el = indicatorRef.current;
      if (!active || !el) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dy > dx || dy > 40) { active = false; return; }
      const tx = Math.min(Math.max(dx * 0.55, 0), 72);
      const opacity = Math.min(tx / 60, 0.9);
      if (prefersReducedMotion()) return;
      // No transition while the finger is down: this tracks the drag 1:1.
      el.style.transition = 'none';
      el.style.transform = `translate(${tx - 40}px, -50%)`;
      el.style.opacity = String(opacity);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const touch = e.changedTouches[0];
      const el = indicatorRef.current;
      if (el) {
        el.style.transition = 'transform 200ms ease, opacity 200ms ease';
        el.style.transform = 'translate(-40px, -50%)';
        el.style.opacity = '0';
      }
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

/**
 * Holds the nav's space while its chunk is in flight.
 *
 * On mobile the nav is `fixed` and the shell already pads for it, so there is
 * nothing to reserve. On desktop it is an in-flow row, and a null fallback
 * would drop the page 64 px the moment the chunk landed — the layout shift this
 * work is supposed to be removing. The classes below are the nav's own outer
 * geometry: `md:mt-8 md:mb-6` plus `p-2` twice around a `min-h-12` item.
 */
function AppNavPlaceholder() {
  return <div aria-hidden="true" className="hidden md:block w-full max-w-6xl md:mt-8 md:mb-6 md:h-16" />;
}

export default function App() {
  const session = useSession();
  const signedIn = session.status === 'authenticated';
  const mainRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useTheme();

  /**
   * Show the landing page while the first session check is still in flight,
   * for a device that has never held a session.
   *
   * The shell used to render nothing at all until `/auth/me` answered, which
   * put a network round trip between first paint and the marketing page — about
   * two seconds of the FCP-to-LCP gap on a throttled mobile profile, plus the
   * layout shift of the footer being pushed down when the page finally arrived.
   *
   * This is not the `anonymous` branch moved earlier. It is guarded on
   * `hasKnownSession` (`lib/session-hint.ts`), so a signed-in user is never
   * shown the marketing page while their own session is being confirmed — the
   * thing the `anonymous`/`unreachable` distinction exists to prevent. If the
   * check then comes back with a user, or with an outage, that state replaces
   * this one exactly as it would have replaced the blank shell.
   */
  const optimisticLanding = session.status === 'loading' && !session.hasKnownSession;
  const showLanding = session.status === 'anonymous' || optimisticLanding;

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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-indigo-500 focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
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
        {/* Nothing is on screen yet and the footer is `mt-auto`, so without
            this the footer sits at the bottom of the viewport and is shoved
            off it the moment content arrives — a full-viewport shift of a
            visible element, and the largest single contributor to CLS on a
            returning user's load. Reserving a viewport keeps it below the
            fold from the first frame. */}
        {session.status === 'loading' && !optimisticLanding && (
          <div aria-hidden="true" className="min-h-dvh w-full" />
        )}
        {showLanding && (
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
          <Suspense fallback={<AppNavPlaceholder />}>
            <AppNav />
          </Suspense>
          <div className="w-full max-w-6xl">
            <RouteBoundary>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/dictionary" element={<DictionaryCard />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/word/:word" element={<DictionaryEntryPage />} />
                <Route path="/word/:word/:pos" element={<DictionaryEntryPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/courses" element={<Navigate to="/library" replace />} />
                <Route path="/courses/:slug" element={<CourseDetailPage />} />
                <Route path="/review" element={<ReviewSession />} />
                <Route path="/story" element={<StoryPage />} />
                <Route path="/known-words" element={<KnownWordsPage />} />
                <Route path="/decks" element={<Navigate to="/library" replace />} />
                <Route path="/decks/:id" element={<DeckDetailPage />} />
                <Route path="/profile" element={<ProfilePage />} />
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

      {/* Last in the DOM, so a floating utility button is last in tab order
          rather than sitting between the skip link and the page. It renders
          nothing at all unless consent is granted and a provider key is
          configured — see ProductFeedbackTrigger. */}
      <ProductFeedbackTrigger signedIn={signedIn} />
    </ToastProvider>
  );
}
