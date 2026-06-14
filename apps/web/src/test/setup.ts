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
