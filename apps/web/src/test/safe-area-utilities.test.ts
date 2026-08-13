import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Regression guard for #87.
 *
 * `px-safe`, `pt-safe`, `pb-safe` and `pb-mobile-nav` used to be hand-written
 * rules in `@layer utilities`. They worked bare, but Tailwind only generates
 * variants for utilities registered with `@utility` — so `md:pb-safe` and
 * `max-md:pb-mobile-nav` in the app shell compiled to nothing at all, and every
 * signed-in user lost their bottom padding. Nothing failed; the CSS was simply
 * absent, which is why this needs a test rather than a code review.
 *
 * Assertions match on class names and media conditions rather than exact
 * punctuation, since the compiler's formatting is not part of the contract.
 */
const require_ = createRequire(import.meta.url);
const INDEX_CSS = resolve(__dirname, '../index.css');

/** Collapse whitespace so `.foo {` and `.foo{` compare the same. */
const squash = (css: string) => css.replace(/\s+/g, ' ');

async function buildCss(candidates: string[]): Promise<string> {
  const source = await readFile(INDEX_CSS, 'utf8');
  const compiler = await compile(source, {
    base: dirname(INDEX_CSS),
    // `@import 'tailwindcss'` and its sub-imports resolve out of node_modules.
    async loadStylesheet(id: string, base: string) {
      const path = id.startsWith('.')
        ? resolve(base, id)
        : require_.resolve(id.endsWith('.css') ? id : `${id}/index.css`);
      return { path, base: dirname(path), content: await readFile(path, 'utf8') };
    },
    async loadModule() {
      throw new Error('index.css should not need a JS module');
    },
  });
  return compiler.build(candidates);
}

describe('safe-area utilities', () => {
  let css = '';

  beforeAll(async () => {
    css = squash(
      await buildCss([
        'px-safe',
        'pt-safe',
        'pb-safe',
        'pb-mobile-nav',
        'md:pb-safe',
        'max-md:pb-mobile-nav',
        'sm:px-safe',
      ]),
    );
  }, 30_000);

  it.each(['px-safe', 'pt-safe', 'pb-safe', 'pb-mobile-nav'])('emits .%s bare', (name) => {
    expect(css).toContain(`.${name} {`);
  });

  // The two the app shell depends on (App.tsx). Their absence was the bug.
  it('emits the responsive variants the app shell uses', () => {
    expect(css).toContain('.md\\:pb-safe');
    expect(css).toContain('.max-md\\:pb-mobile-nav');
  });

  it('emits a variant for any of them, not just the two in use today', () => {
    expect(css).toContain('.sm\\:px-safe');
  });

  it('keeps the 640px step, so a variant carries it too', () => {
    expect(css).toContain('max(2.5rem, env(safe-area-inset-bottom))');
    expect(css).toMatch(/@media \(min-width: 640px\)|@media \(width\s*>=\s*640px\)/);
  });

  it('scopes max-md:pb-mobile-nav below the md breakpoint only', () => {
    // If it ever leaked out of its media query it would add nav clearance on
    // desktop, where there is no bottom nav.
    const index = css.indexOf('.max-md\\:pb-mobile-nav');
    expect(index).toBeGreaterThan(-1);

    const before = css.slice(0, index);
    const lastMedia = before.lastIndexOf('@media');
    expect(lastMedia).toBeGreaterThan(-1);

    const condition = before.slice(lastMedia, lastMedia + 60);
    // Tailwind emits either `(width < 48rem)` or `not all and (width>=48rem)`.
    expect(condition).toMatch(/width\s*<\s*48rem|not all and \(width\s*>=\s*48rem\)/);
  });
});
