import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { fetchEnrichmentQuota, fetchMe, logout, requestEmailSignIn } from '../api';
import { useSettings } from '../hooks/useSettings';
import { trackEvent } from '../lib/telemetry';
import { prefersReducedMotion } from '../lib/motion';
import { ShieldCheck, Mail, Download } from 'lucide-react';
import { CEFRCalibrationCard } from './CEFRCalibrationCard';
import { CEFRBadge } from './CEFRBadge';
import gsap from 'gsap';

export function SignInOptions() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const emailMutation = useMutation({
    mutationFn: () => {
      trackEvent('login', { method: 'email' });
      return requestEmailSignIn(email.trim());
    },
    onSuccess: () => setSent(true),
  });

  useEffect(() => {
    if (containerRef.current && !prefersReducedMotion()) {
      gsap.fromTo(
        containerRef.current.children,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.5, ease: 'back.out(1.2)' }
      );
    }
  }, []);

  return (
    <div ref={containerRef} className="space-y-4 pt-2">
      <a
        href="/api/v1/auth/google"
        rel="external"
        onClick={() => {
          window.location.href = '/api/v1/auth/google';
        }}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-surface-900 transition-all hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
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

      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-surface-800" />
        <span className="shrink-0 px-3 text-xs uppercase tracking-wider text-surface-500 font-mono">
          or magic link
        </span>
        <div className="flex-grow border-t border-surface-800" />
      </div>

      {sent ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
          <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
          <span>Check your inbox! We sent a sign-in link to <strong className="font-semibold text-emerald-200">{email}</strong>.</span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) emailMutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-surface-500" />
            <input
              type="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-surface-800 bg-surface-950/50 py-2.5 pl-10 pr-4 text-sm text-white placeholder-surface-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={emailMutation.isPending || !email.trim()}
            className="w-full rounded-xl border border-surface-700 bg-surface-800 py-2.5 text-xs font-medium text-surface-200 transition-all hover:bg-surface-700 hover:text-white disabled:opacity-50"
          >
            {emailMutation.isPending ? 'Sending...' : 'Send Magic Link'}
          </button>
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
  const [showCalibration, setShowCalibration] = useState(false);

  return (
    <section
      aria-label="Profile"
      className="w-full space-y-6"
    >
      <div className="rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-lg shadow-black/20">
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
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{user.name ?? user.email}</p>
                {user.cefrLevel && <CEFRBadge level={user.cefrLevel} size="sm" />}
              </div>
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
          <div className="mt-4 border-t border-surface-800 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-surface-500">
                  CEFR Proficiency Level
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {user.cefrLevel ? `Calibrated to ${user.cefrLevel}` : 'Not calibrated yet'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCalibration(!showCalibration)}
                className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20"
              >
                {showCalibration ? 'Close Calibration' : 'Calibrate Level'}
              </button>
            </div>

            {user.cefrLevel && !showCalibration && (
              <div className="flex items-center gap-2 rounded-xl bg-surface-950/60 p-3 border border-surface-850">
                <CEFRBadge level={user.cefrLevel} size="md" />
                <p className="text-xs text-surface-300">
                  Card introduction ordering prioritizes new words matching this level.
                </p>
              </div>
            )}
          </div>
        )}

        {user && (
          <div className="mt-4 border-t border-surface-800 pt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-surface-500">
              Offline Data
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-surface-200">Offline Dictionary Pack</p>
                <p className="text-xs text-surface-400">Download top 1,000 enriched entries as JSON</p>
              </div>
              <a
                href="/api/v1/dictionary/offline-pack"
                download="vocabahn-offline.json"
                className="inline-flex items-center gap-2 rounded-xl border border-surface-700 bg-surface-800 px-3 py-2 text-xs font-medium text-surface-200 transition-colors hover:bg-surface-700 hover:text-white"
              >
                <Download className="size-4" />
                Download
              </a>
            </div>
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
      </div>

      {user && (showCalibration || !user.cefrLevel) && (
        <CEFRCalibrationCard
          user={user}
          onDismiss={user.cefrLevel ? () => setShowCalibration(false) : undefined}
        />
      )}
    </section>
  );
}
