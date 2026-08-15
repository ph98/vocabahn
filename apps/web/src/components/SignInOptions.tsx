import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import { requestEmailSignIn } from '../api';
import { markPendingLogin, trackEvent } from '../lib/telemetry';

/**
 * The two ways into the app: Google OAuth and an email magic link.
 *
 * It lives in its own file rather than in `ProfilePage`, where it used to,
 * because `LandingPage` renders it. Importing it from there dragged the whole
 * profile screen — settings, CEFR calibration, the reminder section, their
 * queries and their icons — into the chunk a signed-out visitor downloads
 * before the marketing page can paint.
 *
 * Its entrance is CSS (`.vb-rise-in`), for the same reason: it is on the
 * landing page's critical path, and it used to be a GSAP stagger.
 */
export function SignInOptions() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const emailMutation = useMutation({
    mutationFn: () => requestEmailSignIn(email.trim()),
    // Requesting a link is not a sign-in — it is the top of the funnel, and it
    // may never be followed. `login` is reported from /auth/verify's return.
    onSuccess: () => {
      trackEvent('landing_cta_click', { cta: 'email_magic_link' });
      setSent(true);
    },
  });

  return (
    <div className="space-y-4 pt-2">
      <a
        href="/api/v1/auth/google"
        rel="external"
        style={{ '--vb-delay': '0ms' } as React.CSSProperties}
        onClick={() => {
          trackEvent('landing_cta_click', { cta: 'google' });
          markPendingLogin('google');
          window.location.href = '/api/v1/auth/google';
        }}
        className="vb-rise-in flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-surface-700 bg-surface-900 px-4 text-sm font-semibold text-surface-100 shadow-sm transition-all hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo active:scale-[0.98]"
      >
        <svg className="size-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Sign in with Google
      </a>

      <div
        className="vb-rise-in relative flex items-center py-1"
        style={{ '--vb-delay': '60ms' } as React.CSSProperties}
      >
        <div className="flex-grow border-t border-surface-800" />
        <span className="shrink-0 px-3 text-xs uppercase tracking-wider text-surface-500 font-mono">
          or magic link
        </span>
        <div className="flex-grow border-t border-surface-800" />
      </div>

      {sent ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-300">
          <ShieldCheck className="size-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
          <span>Check your inbox! We sent a sign-in link to <strong className="font-semibold text-emerald-700 dark:text-emerald-200">{email}</strong>.</span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) emailMutation.mutate();
          }}
          className="vb-rise-in space-y-3"
          style={{ '--vb-delay': '120ms' } as React.CSSProperties}
        >
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-surface-500" />
            <input
              type="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-surface-700 bg-surface-900 py-2.5 pl-10 pr-4 text-sm text-surface-100 placeholder-surface-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={emailMutation.isPending || !email.trim()}
            className="w-full rounded-xl border border-surface-700 bg-surface-800 py-2.5 text-xs font-semibold text-surface-200 transition-all hover:bg-surface-700 hover:text-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo disabled:opacity-50"
          >
            {emailMutation.isPending ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
      )}
    </div>
  );
}
