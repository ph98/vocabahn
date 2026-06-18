import { useState, useEffect } from 'react';

interface UserSettings {
  autoplayAudio: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  autoplayAudio: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(() => {
    const stored = localStorage.getItem('vocabahn-settings');
    if (stored) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  const updateSettings = (updates: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem('vocabahn-settings', JSON.stringify(next));
      return next;
    });
  };

  // Sync state if another tab changes localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'vocabahn-settings' && e.newValue) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(e.newValue) });
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
