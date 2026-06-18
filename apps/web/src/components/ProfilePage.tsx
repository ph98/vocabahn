import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { fetchEnrichmentQuota, fetchMe, logout, requestEmailSignIn } from '../api';
import { useSettings } from '../hooks/useSettings';
import gsap from 'gsap';

export function SignInOptions() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const emailMutation = useMutation({
    mutationFn: () => requestEmailSignIn(email.trim()),
    onSuccess: () => setSent(true),
  });

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current.children,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.5, ease: 'back.out(1.2)' }
      );
    }
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-semibold">Welcome back</h3>
        <p className="mt-1 text-sm text-surface-400">Sign in to sync your progress</p>
      </div>

      <a
        href="/api/v1/auth/google"
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-2.5 font-medium text-gray-900 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </a>

      <div className="flex items-center gap-3">
        <hr className="flex-1 border-surface-800" />
        <span className="text-xs font-medium uppercase tracking-wider text-surface-500">or</span>
        <hr className="flex-1 border-surface-800" />
      </div>

      {sent ? (
        <p aria-live="polite" className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-accent-emerald">
          Check your email — we sent a sign-in link to {email}.
        </p>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); emailMutation.mutate(); }}
          className="flex flex-col gap-3"
        >
          <div className="space-y-1">
            <label htmlFor="signin-email" className="text-sm font-medium text-surface-300">
              Email address
            </label>
            <input
              id="signin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-h-11 w-full rounded-xl border border-surface-700 bg-surface-950 px-4 text-sm placeholder:text-surface-500 transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            />
          </div>
          <button
            type="submit"
            disabled={!email.trim() || emailMutation.isPending}
            className="min-h-11 w-full rounded-xl bg-surface-800 px-4 text-sm font-medium transition-colors hover:bg-surface-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
          >
            {emailMutation.isPending ? 'Sending link…' : 'Continue with Email'}
          </button>
          {emailMutation.isError && (
            <p className="text-xs text-accent-red">Something went wrong. Please try again.</p>
          )}
        </form>
      )}
    </div>
  );
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const { data: quota } = useQuery({
    queryKey: ['enrichment-quota'],
    queryFn: fetchEnrichmentQuota,
    enabled: !!user,
    staleTime: 30_000,
  });
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(['me'], null),
  });

  const { settings, updateSettings } = useSettings();

  return (
    <section
      aria-label="Profile"
      className="w-full rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-lg shadow-black/20"
    >
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-surface-400">Profile</h2>
      {isPending && <p aria-live="polite">Checking session…</p>}
      {!isPending && !user && <SignInOptions />}
      {user && (
        <div className="flex items-center gap-4">
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-11 rounded-full ring-2 ring-surface-800"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user.name ?? user.email}</p>
            <p className="truncate text-sm text-surface-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            className="min-h-11 rounded-xl border border-surface-700 px-4 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Sign out
          </button>
        </div>
      )}

      {user && quota && (
        <div className="mt-4 border-t border-surface-800 pt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-surface-500">
            Daily enrichment
          </p>
          <div className="flex items-center gap-3">
            <div
              role="meter"
              aria-label={`Enrichment usage: ${quota.used} of ${quota.cap} used today`}
              aria-valuenow={quota.used}
              aria-valuemin={0}
              aria-valuemax={quota.cap}
              className="h-2 flex-1 overflow-hidden rounded-full bg-surface-800"
            >
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min((quota.used / quota.cap) * 100, 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-surface-400">
              {quota.used} / {quota.cap}
            </span>
          </div>
          <p className="mt-1 text-xs text-surface-500">
            New words you open are AI-enriched (definitions, images, audio). Resets at midnight.
          </p>
        </div>
      )}

      {user && (
        <div className="mt-4 border-t border-surface-800 pt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-surface-500">
            Preferences
          </p>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={settings.autoplayAudio}
                onChange={(e) => updateSettings({ autoplayAudio: e.target.checked })}
              />
              <div className={`block w-10 h-6 rounded-full transition-colors ${settings.autoplayAudio ? 'bg-indigo-500' : 'bg-surface-700 group-hover:bg-surface-600'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.autoplayAudio ? 'translate-x-4' : ''}`}></div>
            </div>
            <span className="text-sm text-surface-300">Autoplay audio during reviews</span>
          </label>
        </div>
      )}
    </section>
  );
}
