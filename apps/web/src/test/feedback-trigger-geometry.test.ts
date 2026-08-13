import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The feedback trigger's clearance of the mobile nav and the toast region is
 * pure CSS, and jsdom has no layout — so it is asserted here, against the
 * compiled stylesheet, the same way the safe-area utilities are.
 *
 * What the geometry has to guarantee (#80):
 *
 * - the trigger never overlaps the fixed bottom nav — it inherits
 *   `--vb-toast-inset-bottom`, which is the nav height plus a gap;
 * - it never overlaps a toast at 375 px, where the toast list is full-width —
 *   a live toast lifts it by one toast's height;
 * - it does not float pointlessly high on desktop, where the toast list is
 *   centred at 26 rem and cannot reach the right edge.
 */
const require_ = createRequire(import.meta.url);
const INDEX_CSS = resolve(__dirname, '../index.css');

/** Collapse whitespace so `.foo {` and `.foo{` compare the same. */
const squash = (css: string) => css.replace(/\s+/g, ' ');

async function buildCss(): Promise<string> {
  const source = await readFile(INDEX_CSS, 'utf8');
  const compiler = await compile(source, {
    base: dirname(INDEX_CSS),
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
  return compiler.build([]);
}

describe('feedback trigger geometry', () => {
  let css = '';

  beforeAll(async () => {
    css = squash(await buildCss());
  }, 30_000);

  it('anchors the trigger to the toast region, which already clears the nav', () => {
    expect(css).toContain('--vb-feedback-inset-bottom: var(--vb-toast-inset-bottom)');
    expect(css).toContain('.vb-feedback-trigger { position: fixed;');
    expect(css).toContain('bottom: var(--vb-feedback-inset-bottom)');
  });

  it('transitions colours itself, since it outranks Tailwind`s transition-colors', () => {
    // This rule is unlayered and beats the utility, so a `transition-colors`
    // class on the element would be silently dropped.
    const rule = css.slice(css.indexOf('.vb-feedback-trigger {'));
    expect(rule.slice(0, 400)).toContain('background-color 150ms');
  });

  it('sits above the nav but below the toast region', () => {
    expect(css).toContain('--vb-feedback-z: 55');
    expect(css).toContain('z-index: var(--vb-feedback-z)');
  });

  it('steps up by one toast height while a toast is on screen', () => {
    expect(css).toContain('--vb-feedback-toast-clearance: 5.5rem');
    expect(css).toContain(
      'body:has(.vb-toast) .vb-feedback-trigger { bottom: calc(var(--vb-feedback-inset-bottom) + var(--vb-feedback-toast-clearance));',
    );
  });

  it('drops the step-up from md up, where the toast list cannot reach the right edge', () => {
    const media = css.indexOf('@media (min-width: 768px)');
    expect(media).toBeGreaterThan(-1);

    const block = css.slice(media, media + 400);
    expect(block).toContain('--vb-feedback-toast-clearance: 0rem');
    expect(block).toContain('--vb-feedback-inset-right: 1.5rem');
  });

  it('drops the transition under prefers-reduced-motion', () => {
    const media = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(media).toBeGreaterThan(-1);
    expect(css.slice(media)).toContain('.vb-feedback-trigger { transition: none;');
  });
});
