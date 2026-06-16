import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'vocabahn-theme';
const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#fafafa',
  dark: '#0a0a0a',
};

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  if (theme !== 'system') {
    root.classList.add(`theme-${theme}`);
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', THEME_COLORS[resolve(theme)]);
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

/** Persisted light/dark/system theme preference; applies `theme-light`/`theme-dark` to <html> and updates the theme-color meta tag. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
