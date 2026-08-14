import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import { afterEach, expect } from 'vitest';

expect.extend(toHaveNoViolations);

// Without `globals: true`, @testing-library/react's automatic cleanup
// doesn't register — do it explicitly so each test gets a fresh DOM.
afterEach(() => cleanup());

// jsdom doesn't implement matchMedia; components use it to check
// `prefers-reduced-motion`.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

// In Node 22+, globalThis.localStorage is defined as undefined unless --localstorage-file is passed.
// Provide a working in-memory Storage implementation for Vitest/jsdom.
if (typeof window !== 'undefined') {
  const createMemoryStorage = () => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = String(value); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (i: number) => Object.keys(store)[i] ?? null,
    };
  };

  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });

  window.scrollTo = () => {};
  Element.prototype.scrollTo = () => {};
}


