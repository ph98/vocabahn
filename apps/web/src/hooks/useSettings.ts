import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toast';

export interface UserSettings {
  autoplayAudio: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  autoplayAudio: false,
};

const STORAGE_KEY = 'vocabahn-settings';

/**
 * Display names for settings. A key with no entry here falls back to a
 * humanised form of the key itself, so adding a field to `UserSettings`
 * produces a sensible toast without registering it — an entry only buys nicer
 * wording.
 */
const SETTING_LABELS: Partial<Record<keyof UserSettings, string>> = {
  autoplayAudio: 'Autoplay audio',
};

/** `autoplayAudio` → `Autoplay audio`; an explicit label wins. */
export function settingLabel(key: string): string {
  const explicit = SETTING_LABELS[key as keyof UserSettings];
  if (explicit) return explicit;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Toast copy for one changed setting. Names what changed rather than saying
 * "Saved", so the confirmation is checkable against what the user just did.
 */
export function describeSettingChange(key: string, value: unknown): string {
  const label = settingLabel(key);
  if (typeof value === 'boolean') return `${label} ${value ? 'on' : 'off'}`;
  return `${label} set to ${String(value)}`;
}

function readStoredSettings(): UserSettings {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<UserSettings>(readStoredSettings);
  // `updateSettings` needs the current value synchronously, and it must not run
  // its side effects (persist, toast) inside a state updater — React invokes
  // updaters twice under StrictMode.
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateSettings = useCallback(
    (updates: Partial<UserSettings>) => {
      const prev = settingsRef.current;
      const next = { ...prev, ...updates };
      const changed = (Object.keys(updates) as (keyof UserSettings)[]).filter(
        (key) => next[key] !== prev[key],
      );
      if (changed.length === 0) return;

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage can genuinely fail (private browsing, quota). Say so rather
        // than leaving a control showing a preference that was never stored.
        for (const key of changed) {
          toast.error(`Couldn't save ${settingLabel(key).toLowerCase()}`, {
            id: `setting:${key}`,
            description: 'Your browser refused to store the change.',
          });
        }
        return;
      }

      settingsRef.current = next;
      setSettings(next);

      // One toast per changed setting, keyed on the setting: re-toggling the
      // same control replaces its toast instead of stacking copies, while two
      // different settings each get their own.
      for (const key of changed) {
        toast.success(describeSettingChange(key, next[key]), { id: `setting:${key}` });
      }
    },
    [toast],
  );

  // Sync state if another tab changes localStorage. No toast: the change did
  // not happen here, and confirming someone else's action is noise.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(e.newValue) };
          settingsRef.current = parsed;
          setSettings(parsed);
        } catch {
          // Ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return { settings, updateSettings };
}
