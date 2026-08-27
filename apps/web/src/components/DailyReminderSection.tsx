import { BellOff, BellRing, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNotificationSettings } from '../hooks/useNotificationSettings';

/**
 * The daily study reminder control.
 *
 * Its whole job is to never show a switch that does nothing. Four things can
 * make a reminder impossible and each gets its own honest explanation instead
 * of a dead toggle:
 *
 * - the deployment has no VAPID keys, so the server cannot send at all;
 * - the browser has no Push API (an old browser, or a private window);
 * - iOS Safari, where push exists only inside a home-screen install;
 * - the user already denied permission, which only they can undo.
 *
 * The permission prompt is reached from exactly one place — the "Remind me
 * daily" button below. It is one-shot per origin, so firing it on mount would
 * permanently spend it on a user who had not asked for anything.
 */
export function DailyReminderSection() {
  const { settings, isPending, support, permission, isSaving, enable, disable, setTime } =
    useNotificationSettings();

  // Local mirror so the time input stays responsive while a save is in flight.
  const [time, setLocalTime] = useState('19:00');
  useEffect(() => {
    if (settings?.reminderTime) setLocalTime(settings.reminderTime);
  }, [settings?.reminderTime]);

  const enabled = settings?.reminderEnabled ?? false;

  return (
    <div className="mt-4 border-t border-surface-800 pt-4">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-surface-500">
        Daily study reminder
      </p>

      {isPending && <p className="text-xs text-surface-400">Checking…</p>}

      {settings && (
        <>
          {!settings.pushConfigured ? (
            <Unavailable>
              Reminders aren't set up on this server yet, so there's nothing to turn on.
            </Unavailable>
          ) : support.reason === 'ios-needs-install' ? (
            <Unavailable>
              <span className="flex flex-wrap items-center gap-1">
                On iPhone and iPad, reminders need Vocabahn added to your Home Screen. Tap
                <Share aria-hidden="true" className="inline size-3.5 shrink-0" />
                <span className="sr-only">the Share button</span>
                Share, then <strong className="font-semibold">Add to Home Screen</strong>, and open
                it from there.
              </span>
            </Unavailable>
          ) : !support.supported ? (
            <Unavailable>
              This browser can't receive push notifications. Chrome, Edge, Firefox and Safari 16.4+
              can.
            </Unavailable>
          ) : permission === 'denied' ? (
            <Unavailable>
              Notifications are blocked for this site in your browser. Re-allow them in your
              browser's site settings, then come back — we can't ask again from here.
            </Unavailable>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-200">
                    {enabled ? 'Reminders are on' : 'Get a nudge when cards are due'}
                  </p>
                  <p className="text-xs text-surface-400">
                    {enabled
                      ? `One notification a day at ${settings.reminderTime}, your local time. Skipped on days you've already reviewed.`
                      : 'One notification a day, telling you how many cards are waiting.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => (enabled ? disable() : enable())}
                  disabled={isSaving}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo disabled:opacity-50 ${
                    enabled
                      ? 'border-surface-700 text-surface-300 hover:bg-surface-800'
                      : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
                  }`}
                >
                  {enabled ? (
                    <BellOff aria-hidden="true" className="size-4" />
                  ) : (
                    <BellRing aria-hidden="true" className="size-4" />
                  )}
                  {enabled ? 'Turn off' : 'Remind me daily'}
                </button>
              </div>

              {enabled && (
                <div className="mt-3 flex items-center gap-3">
                  <label
                    htmlFor="reminder-time"
                    className="text-xs font-medium text-surface-300"
                  >
                    Remind me at
                  </label>
                  <input
                    id="reminder-time"
                    type="time"
                    value={time}
                    disabled={isSaving}
                    onChange={(event) => setLocalTime(event.target.value)}
                    onBlur={(event) => {
                      const next = event.target.value;
                      if (next && next !== settings.reminderTime) setTime(next);
                    }}
                    className="min-h-11 rounded-xl border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <span className="text-xs text-surface-500">
                    {settings.timezone ?? 'UTC'}
                  </span>
                </div>
              )}

              {enabled && settings.deviceCount > 1 && (
                <p className="mt-2 text-xs text-surface-500">
                  Sent to {settings.deviceCount} devices you've turned this on for.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One shape for every "this cannot work here, and here is why" message.
 * Deliberately not a live region: it is the section's resting content, and the
 * toast region already announces the things that actually change.
 */
function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-surface-800 bg-surface-950/60 p-3 text-xs text-surface-400">
      {children}
    </p>
  );
}
