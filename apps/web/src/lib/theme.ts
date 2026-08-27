import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'vocabahn-theme';
const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#FBFBFA',
  dark: '#0a0a0a',
};

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  if (theme !== 'system') {
    root.classList.add(`theme-${theme}`);
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', THEME_COLORS[resolveTheme(theme)]);
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

let globalTheme: Theme = readStoredTheme();
const listeners = new Set<(theme: Theme) => void>();

/** Persisted light/dark/system theme preference; applies `theme-light`/`theme-dark` to <html> and updates the theme-color meta tag. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(globalTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const listener = (newTheme: Theme) => {
      setThemeState(newTheme);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    globalTheme = next;
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    applyTheme(next);
    listeners.forEach((l) => l(next));
  }, []);

  return [theme, setTheme];
}
