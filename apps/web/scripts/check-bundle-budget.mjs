#!/usr/bin/env node
/**
 * Fails the build when a signed-out visitor's first paint costs more than the
 * agreed budget.
 *
 * The number that matters is not "the entry chunk" — Rollup can make that
 * smaller by moving code into a sibling that `index.html` preloads in the same
 * breath, which changes nothing about what the browser downloads. So the budget
 * is measured over *everything `index.html` asks for up front*: the entry
 * script plus every `modulepreload`, plus the stylesheet, gzipped, exactly as
 * nginx serves them.
 *
 * Run after `vite build`, from `apps/web`. `--json` prints the measurement
 * without asserting, which is how the before/after numbers in #71 were taken.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(webRoot, 'dist');

/**
 * Budgets, in gzipped bytes.
 *
 * The issue proposed 100 kB for initial JS. That is not reachable while the app
 * is a client-rendered SPA: React, the router, TanStack Query, axios and the
 * shared Zod schemas are ~135 kB gzipped before a line of Vocabahn code, and
 * removing any of them is a different piece of work with a different risk
 * profile (#71 items 5 and 6). These are set just above what this branch
 * actually achieves, so the gate catches a regression rather than being a
 * target nobody can hit — raise them only with a measurement and a reason.
 */
const BUDGETS = {
  js: 150 * 1024,
  css: 20 * 1024,
};

/** Everything the browser fetches before it can paint the landing page. */
function initialAssets() {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const urls = new Set();

  // <script type="module" src> — the entry.
  for (const [, src] of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) urls.add(src);
  // <link rel="modulepreload"> — chunks the entry statically imports.
  for (const [, href] of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) urls.add(href);
  // <link rel="stylesheet"> — render-blocking, same-origin only.
  for (const [, href] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) urls.add(href);

  const js = [];
  const css = [];
  for (const url of urls) {
    if (!url.startsWith('/')) continue; // third-party, not ours to budget
    const bytes = gzipSync(readFileSync(join(distDir, url.slice(1))), { level: 9 }).length;
    (url.endsWith('.css') ? css : js).push({ url, bytes });
  }
  return { js, css };
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

const { js, css } = initialAssets();
const totals = {
  js: js.reduce((s, a) => s + a.bytes, 0),
  css: css.reduce((s, a) => s + a.bytes, 0),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ js, css, totals }, null, 2));
  process.exit(0);
}

console.log('Landing-page initial payload (gzipped, as served):\n');
for (const a of [...js, ...css].sort((a, b) => b.bytes - a.bytes)) {
  console.log(`  ${kb(a.bytes).padStart(10)}  ${a.url}`);
}

let failed = false;
for (const kind of ['js', 'css']) {
  const total = totals[kind];
  const budget = BUDGETS[kind];
  const verdict = total > budget ? 'OVER BUDGET' : 'ok';
  const pct = ((total / budget) * 100).toFixed(0);
  console.log(`\n  ${kind.toUpperCase()}: ${kb(total)} of ${kb(budget)} (${pct}%) — ${verdict}`);
  if (total > budget) failed = true;
}

if (failed) {
  console.error(
    '\nThe landing page got heavier than the budget in apps/web/scripts/check-bundle-budget.mjs.' +
      '\nEither find the regression (a static import of something that should be lazy is the usual' +
      '\ncause — check what moved into the entry chunk), or raise the budget deliberately, with the' +
      '\nnew number and the reason in the commit message.',
  );
  process.exit(1);
}

console.log('\nWithin budget.');
