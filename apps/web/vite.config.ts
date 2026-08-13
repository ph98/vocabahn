import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Read version from the root package.json so the UI and git tags stay in sync.
const { version } = require('../../package.json') as { version: string };

export default defineConfig({
  envDir: '../../',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React and the router change with their own releases, not with ours.
          // Without this they are inlined into the app chunk, so every edit to
          // any component invalidates ~50 kB gzipped of framework a returning
          // visitor already has cached. Nothing else is split by hand: Rollup's
          // own chunking follows the lazy routes, and second-guessing it tends
          // to produce chunks that are fetched together anyway.
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/]node_modules[\\/](react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-router';
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // The default injects `registerSW.js` as a blocking `<script>` in the
      // head: 0.4 kB that cost 152 ms of render-blocking time. Nothing on the
      // first paint depends on the worker being registered — updates, offline
      // caching and the stale-chunk reload path in `lib/app-update.ts` all work
      // just as well one tick later.
      injectRegister: 'script-defer',
      // `og-image.png` is deliberately absent. It is 376 kB, it is only ever
      // fetched by a crawler rendering a link preview, and precaching it made
      // every first-time visitor download it over the same connection the
      // landing page was still trying to load on. It is still deployed and
      // still served — it is simply not part of the app shell.
      // The latin font subset is genuinely app shell — without it an offline
      // review session renders in the system fallback — and it costs nothing to
      // precache: `index.html` preloads it on the same visit, and nginx serves
      // woff2 immutable, so the worker's fetch comes out of the HTTP cache.
      // `latin-ext` is not here; it is a rarity even in German.
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon.svg', 'icon-maskable.svg', 'fonts/plus-jakarta-sans-v12-latin.woff2'],
      // Same argument for the manifest's install icons: 512 px PNGs are fetched
      // by the OS at install time, not by the page, and the CacheFirst image
      // rule below picks them up if anything ever does request them.
      includeManifestIcons: false,
      manifest: {
        name: 'Vocabahn — Learn German in the Fast Lane',
        short_name: 'Vocabahn',
        description: 'German vocabulary learning with FSRS spaced repetition and AI dictionary',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api/],
        // Web Push needs `push` / `notificationclick` listeners, and there is
        // nowhere to put them in a worker Workbox writes end to end. Importing
        // them keeps everything above generated — the precache, the navigation
        // fallback denylist, and the runtime caching rules an offline review
        // session depends on — instead of hand-rolling all of it under
        // `injectManifest` for the sake of one listener. See
        // `public/push-sw.js` for the trade-off in full.
        importScripts: ['/push-sw.js'],
        // The worker imports that file directly, so precaching it would only
        // store a second copy of something never fetched through the cache.
        globIgnores: ['**/node_modules/**/*', 'push-sw.js'],
        // Due cards and dictionary entries are the data a review session
        // needs offline; cache them with a network-first strategy so a
        // stale-but-usable response is available when offline.
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/reviews\/due/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'reviews-due',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/api\/v1\/dictionary\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dictionary-entries',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'audio' || request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-assets',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Use the shared package's TS source so Vite serves ESM (the dist build
      // is CommonJS for the NestJS api) and shared edits hot-reload.
      '@vocabahn/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
