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
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon.svg', 'icon-maskable.svg', 'og-image.png'],
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
        navigateFallbackDenylist: [/^\/api/],
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
