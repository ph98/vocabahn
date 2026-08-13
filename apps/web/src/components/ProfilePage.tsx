import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchEnrichmentQuota,
  fetchMe,
  logout,
  updateInterests,
} from '../api';
import { STORY_TOPICS } from '@vocabahn/shared';
import { useSettings } from '../hooks/useSettings';
import { Download } from 'lucide-react';
import { CEFRCalibrationCard } from './CEFRCalibrationCard';
import { CEFRBadge } from './CEFRBadge';
import { DailyReminderSection } from './DailyReminderSection';
import { SignInOptions } from './SignInOptions';

/**
 * Which subjects the learner's stories are drawn from when they don't pick one
 * per story — and what the scheduled morning story uses, where there is nobody
 * to ask. Saves on toggle rather than behind a button: one topic is one click,
 * and a Save the learner forgets silently loses the setting.
 */
function InterestsSection({ interests }: { interests: string[] }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>(interests);

  const save = useMutation({
    mutationFn: updateInterests,
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      setSelected(user.interests);
    },
    // The server is the authority; on failure fall back to what it last told us
    // rather than leaving a chip lit for a preference that was never stored.
    onError: () => setSelected(interests),
  });

  const toggle = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug];
    setSelected(next);
    save.mutate(next);
  };

  return (
    <div className="mt-4 border-t border-surface-800 pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-surface-500">
        Reading Interests
      </p>
      <p className="mt-0.5 text-xs text-surface-400">
        {selected.length === 0
          ? 'Pick subjects and your daily story is drawn from real German coverage of them.'
          : `Your daily story is drawn from ${selected.length} ${selected.length === 1 ? 'subject' : 'subjects'}.`}
      </p>

      <fieldset disabled={save.isPending} className="mt-3">
        <legend className="sr-only">Reading interests</legend>
        <div className="flex flex-wrap gap-2">
          {STORY_TOPICS.map((topic) => {
            const active = selected.includes(topic.slug);
            return (
              <button
                key={topic.slug}
                type="button"
                onClick={() => toggle(topic.slug)}
                aria-pressed={active}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 ${
                  active
                    ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200'
                    : 'border-surface-700 text-surface-300 hover:border-surface-600 hover:bg-surface-800'
                }`}
              >
                <span aria-hidden="true">{topic.emoji}</span> {topic.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {save.isError && (
        <p role="status" className="mt-2 text-xs text-accent-red">
          Couldn't save your interests. Please try again.
        </p>
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

        {user && <InterestsSection interests={user.interests} />}

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

        {/* Server-backed, unlike the localStorage preference above: the server
            is what sends the reminder, so switching it off has to reach it. */}
        {user && <DailyReminderSection />}
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
