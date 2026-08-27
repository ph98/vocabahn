import { useGSAP } from '@gsap/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import {
  BadgeCheck,
  BookOpen,
  ChevronRight,
  CircleUserRound,
  HelpCircle,
  LogOut,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api';
import { useSessionUser } from '../hooks/useSession';
import { prefersReducedMotion, springSnappy } from '../lib/motion';
import { type Theme, useTheme } from '../lib/theme';
import { CEFRBadge } from './CEFRBadge';
import { Logo } from './Logo';
import { useToast } from './Toast';

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

const THEME_OPTIONS: { theme: Theme; label: string; icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }[] = [
  { theme: 'system', label: 'System', icon: Monitor },
  { theme: 'light',  label: 'Light',  icon: Sun },
  { theme: 'dark',   label: 'Dark',   icon: Moon },
];

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

interface MenuSectionItem {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

const LEARNING_ITEMS: MenuSectionItem[] = [
  {
    to: '/story',
    label: 'Micro-Stories',
    description: 'AI-generated reading practice with real news',
    icon: BookOpen,
  },
  {
    to: '/known-words',
    label: 'Known Words',
    description: 'Vocabulary inventory & CEFR progression',
    icon: BadgeCheck,
  },
];

const ACCOUNT_ITEMS: MenuSectionItem[] = [
  {
    to: '/profile',
    label: 'Profile & Settings',
    description: 'CEFR level, topics, reminders & account',
    icon: CircleUserRound,
  },
  {
    to: '/help',
    label: 'Help & User Guide',
    description: 'Shortcuts, FAQs & spaced repetition guide',
    icon: HelpCircle,
  },
];

/**
 * Accessible Profile & Navigation Menu.
 * Features:
 * - Clear user profile summary header with avatar, name, email & CEFR badge
 * - Grouped sections with high-contrast titles and clear, informative descriptions
 * - Interactive 3-way theme picker
 * - Integrated sign out button
 * - WAI-ARIA Menu pattern with full keyboard navigation (Up/Down/Home/End/Escape/Tab)
 * - Automatic focus management and outside click detection
 */
function ProfileMenu({
  onClose,
  buttonRef,
}: {
  onClose: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const user = useSessionUser();
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const [theme, setTheme] = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const signOutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      toast.info('Signed out', { id: 'auth:signout' });
      onClose();
      navigate('/');
    },
    onError: () => {
      toast.error("Couldn't sign out", {
        id: 'auth:signout',
        description: 'Please check your connection and try again.',
      });
    },
  });

  // Calculate tethered position relative to the trigger button
  useEffect(() => {
    if (!buttonRef.current) return;
    const btn = buttonRef.current.getBoundingClientRect();
    const right = Math.max(window.innerWidth - btn.right, 12);
    // If button is in the lower half of the viewport (mobile bottom nav), show above it.
    // Otherwise (desktop inline nav), show below it.
    setStyle(
      btn.top > window.innerHeight * 0.6
        ? { bottom: window.innerHeight - btn.top + 10, right, visibility: 'visible' }
        : { top: btn.bottom + 10, right, visibility: 'visible' },
    );
  }, [buttonRef]);

  // Entrance animation
  useGSAP(() => {
    if (prefersReducedMotion() || style.visibility !== 'visible') return;
    gsap.from(ref.current, { y: 10, opacity: 0, duration: 0.2, ease: 'power2.out' });
  }, { scope: ref, dependencies: [style.visibility] });

  // Focus management: move focus into the menu when mounted
  useEffect(() => {
    if (style.visibility === 'visible' && ref.current) {
      const firstFocusable = ref.current.querySelector<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      firstFocusable?.focus();
    }
  }, [style.visibility]);

  // Keyboard navigation for WAI-ARIA menu pattern
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      buttonRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!ref.current) return;
      const focusables = Array.from(
        ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (focusables.length === 0) return;

      const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        e.key === 'ArrowDown'
          ? currentIndex >= 0
            ? (currentIndex + 1) % focusables.length
            : 0
          : currentIndex > 0
            ? currentIndex - 1
            : focusables.length - 1;
      focusables[nextIndex]?.focus();
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      const first = ref.current?.querySelector<HTMLElement>('a[href], button:not([disabled])');
      first?.focus();
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      const focusables = ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focusables && focusables.length > 0) {
        focusables[focusables.length - 1]?.focus();
      }
      return;
    }

    if (e.key === 'Tab') {
      // Natural tab out closes the menu smoothly
      setTimeout(() => {
        if (!ref.current?.contains(document.activeElement)) {
          onClose();
        }
      }, 0);
    }
  };

  const renderMenuItem = ({ to, label, description, icon: Icon }: MenuSectionItem) => (
    <NavLink
      key={to}
      to={to}
      role="menuitem"
      onClick={onClose}
      className={({ isActive }) =>
        `group flex items-start gap-3 rounded-xl p-2.5 transition-all text-left min-h-[44px] ${
          isActive
            ? 'bg-accent-indigo/15 text-accent-indigo'
            : 'text-surface-200 hover:bg-surface-800/80 hover:text-surface-100'
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-indigo`
      }
    >
      {({ isActive }) => (
        <>
          <div
            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              isActive
                ? 'border-accent-indigo/40 bg-accent-indigo/20 text-accent-indigo'
                : 'border-surface-700/60 bg-surface-800/50 text-surface-400 group-hover:border-surface-600 group-hover:text-surface-200'
            }`}
          >
            <Icon aria-hidden className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-surface-100 group-hover:text-surface-100 leading-tight">
              {label}
            </span>
            <span className="block text-xs text-surface-400 leading-snug mt-0.5">
              {description}
            </span>
          </div>
        </>
      )}
    </NavLink>
  );

  return (
    <div
      ref={ref}
      id="profile-menu-dropdown"
      role="menu"
      tabIndex={-1}
      aria-label="Profile and quick navigation menu"
      onKeyDown={handleKeyDown}
      className="fixed z-50 w-72 sm:w-80 max-w-[calc(100vw-24px)] flex flex-col gap-2 rounded-2xl border border-surface-700/80 bg-surface-900/95 p-2.5 shadow-2xl backdrop-blur-xl max-h-[80vh] overflow-y-auto"
      style={style}
    >
      {/* User Info Header */}
      {user && (
        <Link
          to="/profile"
          role="menuitem"
          onClick={onClose}
          className="group flex items-center gap-3 rounded-xl border border-surface-700/50 bg-surface-800/40 p-2.5 transition-all hover:border-surface-600 hover:bg-surface-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-indigo"
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-10 rounded-xl object-cover ring-1 ring-surface-700 shadow-sm"
            />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent-indigo/15 text-accent-indigo ring-1 ring-accent-indigo/30 font-bold text-base shadow-sm">
              {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-surface-100 group-hover:text-surface-100">
                {user.name ?? 'Learner'}
              </span>
              {user.cefrLevel && <CEFRBadge level={user.cefrLevel} size="sm" />}
            </div>
            <p className="truncate text-xs text-surface-400">{user.email}</p>
          </div>
          <ChevronRight aria-hidden className="size-4 text-surface-500 group-hover:text-surface-300 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {/* Learning Tools Section */}
      <div className="space-y-0.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-surface-500">
          Learning
        </p>
        {LEARNING_ITEMS.map(renderMenuItem)}
      </div>

      <div className="h-px w-full bg-surface-800/80 my-0.5" aria-hidden="true" />

      {/* Account & Settings Section */}
      <div className="space-y-0.5">
        <p className="px-2.5 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-surface-500">
          Preferences &amp; Support
        </p>
        {ACCOUNT_ITEMS.map(renderMenuItem)}
      </div>

      <div className="h-px w-full bg-surface-800/80 my-0.5" aria-hidden="true" />

      {/* Appearance / Theme Selector */}
      <div className="px-2.5 py-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-surface-300">Appearance</span>
          <span className="text-[11px] font-medium text-surface-500 capitalize">{theme}</span>
        </div>
        <div
          role="group"
          aria-label="Theme mode selection"
          className="flex items-center gap-1 rounded-xl bg-surface-800/60 p-1 border border-surface-700/50"
        >
          {THEME_OPTIONS.map(({ theme: t, label, icon: ThemeIcon }) => {
            const isActive = theme === t;
            return (
              <button
                key={t}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                aria-label={`Switch to ${label} theme`}
                onClick={() => setTheme(t)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all min-h-[36px] ${
                  isActive
                    ? 'bg-surface-700 text-surface-100 shadow-sm'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/40'
                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-indigo`}
              >
                <ThemeIcon aria-hidden className="size-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px w-full bg-surface-800/80 my-0.5" aria-hidden="true" />

      {/* Sign Out Button */}
      <button
        type="button"
        role="menuitem"
        disabled={signOutMutation.isPending}
        onClick={() => signOutMutation.mutate()}
        className="flex items-center gap-3 rounded-xl p-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors w-full text-left min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400">
          <LogOut aria-hidden className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="block text-sm font-bold leading-tight">Sign out</span>
          <span className="block text-xs text-rose-400/70 font-normal leading-snug mt-0.5">
            Safely end your session
          </span>
        </div>
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

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

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
        <div
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onClick={() => {
            setMoreOpen(false);
            moreButtonRef.current?.focus();
          }}
        />
      )}
      {moreOpen && <ProfileMenu onClose={() => setMoreOpen(false)} buttonRef={moreButtonRef} />}

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
        {/* Desktop Branding Logo & App Name */}
        <div className="hidden md:flex items-center pl-1 pr-3 border-r border-surface-700/40 mr-1 shrink-0">
          <Link
            to="/"
            aria-label="Vocabahn Home"
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-all duration-200 hover:bg-surface-700/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo group"
          >
            <Logo variant="full" size="md" />
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

        {/* Profile & More Menu Trigger */}
        <button
          ref={moreButtonRef}
          id="profile-menu-button"
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-controls="profile-menu-dropdown"
          aria-label="Profile navigation options"
          className={itemClass(moreActive || moreOpen)}
        >
          {(moreActive || moreOpen) && activeIndicator}
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-[22px] rounded-full object-cover shadow-sm border border-surface-700/50"
            />
          ) : user ? (
            <div className="flex size-[22px] items-center justify-center rounded-full bg-accent-indigo/20 text-accent-indigo text-[10px] font-bold border border-accent-indigo/40">
              {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
            </div>
          ) : (
            <NavSvgIcon d={ICON_MORE} />
          )}
          <span className={labelClass}>Profile</span>
        </button>
      </nav>
    </MotionConfig>
  );
}
