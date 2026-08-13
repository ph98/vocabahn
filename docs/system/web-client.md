# Web Client

The SPA: routing, navigation, theming, motion, gestures, accessibility, and PWA
behaviour.

Code: `apps/web/src/App.tsx` (539 lines — shell, nav, and route table),
`apps/web/src/components/`, `apps/web/src/lib/`, `apps/web/vite.config.ts`.

## Shell

`App.tsx` gates on `useQuery(['me'])`. Signed out → `LandingPage` plus a Google
One Tap prompt. Signed in → `AppNav` and the route table. There is no router
guard: the routes simply are not mounted when there is no user.

Routes, all lazy-loaded behind one `Suspense` except the dictionary, profile, and
landing pages:

```
/                 DashboardPage          /review           ReviewSession
/dictionary       DictionaryCard         /known-words      KnownWordsPage
/word/:word       DictionaryEntryPage    /profile          ProfilePage
/library          LibraryPage            /status           StatusPage
/courses/:slug    CourseDetailPage       /decks/:id        DeckDetailPage

/dashboard → /   ·   /courses → /library   ·   /decks → /library   (redirects)
```

## Navigation

One `<nav aria-label="Main">` that changes shape by breakpoint: a fixed bottom
bar with `env(safe-area-inset-bottom)` padding on mobile, an in-flow pill row
with the logo on desktop. Review is a raised circular FAB on mobile.

Five slots (**observed**): Dashboard, Dictionary, Review, Library, Profile. The
last is a popover — the avatar when one exists, otherwise a "more" glyph —
holding **Known words**, **Profile**, and the theme cycle. `/known-words` and
`/status` are reachable only through it and the footer status dot.

The mobile active-tab underline is a `motion` `layoutId` element that slides
between slots; on desktop the active state is a filled pill instead.

## Theme

`lib/theme.ts`: `light` / `dark` / `system`, persisted in `localStorage`
(`vocabahn-theme`), applied as `theme-light` / `theme-dark` classes on
`documentElement` (no class for `system`), and mirrored into the `theme-color`
meta tag. The nav popover cycles system → light → dark. In dev only,
`Ctrl+Shift+L` toggles light/dark directly.

## Motion

Two libraries, split by job:

- **GSAP** (`@gsap/react`'s `useGSAP`) for imperative, gesture-coupled work: the
  review card's drag transform and fly-off, nav entrance, popover entrance, the
  edge-swipe indicator.
- **Motion** (`motion/react`) for declarative layout and presence: the nav
  indicator's `layoutId`, rating-button stagger, session-summary reveal,
  `AnimatePresence` between the Show-answer and rating rows.

`lib/motion.ts` exports the shared `spring` / `springSnappy` configs and a
`prefersReducedMotion()` guard. Every GSAP call site checks it, and both
`MotionConfig` usages set `reducedMotion="user"`.

Gestures: swipe-to-rate on the review card; `PullToRefresh` on the dashboard; and
`EdgeSwipeBack`, a window-level touch handler that runs `navigate(-1)` on a
right-swipe starting within 24 px of the left edge — disabled on `/review` so it
cannot fight the card's own drag.

## Toasts

`components/Toast.tsx` is the app-wide confirmation primitive: a `ToastProvider`
mounted at the top of `App.tsx`, and a `useToast()` hook returning a stable
`{ show, success, error, info, dismiss }` object safe to put in effect
dependencies.

A toast carries a message, an optional description, and **one** optional action
button (`{ label, onClick }`) — the action dismisses the toast before it runs.
Deliberately not a notification framework.

- `options.id` is a dedupe key: firing again with the same id replaces the live
  toast in place and restarts its timer instead of stacking a copy. Settings use
  `setting:<key>`, so hammering one toggle produces one toast.
- Default auto-dismiss is 3 s; `duration: 0` keeps a toast until dismissed. At
  most three are on screen, oldest dropped.
- The region is always mounted — a live region has to exist before content is
  inserted into it — as `role="region"` / `aria-label="Notifications"` wrapping
  `role="status"` / `aria-live="polite"` / `aria-atomic="false"`. Every toast has
  an icon-only Dismiss button at 44 px.
- Entry animation is CSS (`.vb-toast`, `@keyframes vb-toast-in`) and is switched
  off under `prefers-reduced-motion`, matching `lib/motion.ts`'s contract. There
  is no exit animation.
- A nested `ToastProvider` defers to its ancestor rather than mounting a second
  region, so test helpers can wrap without knowing what is already in the tree.

Geometry lives in CSS custom properties on `:root` in `index.css`, re-exported
as `TOAST_REGION` from `Toast.tsx` so other floating UI can sit clear of it:

| Property | Meaning |
| :--- | :--- |
| `--vb-mobile-nav-height` | Space the fixed bottom nav occupies; `0px` from `md` up. Drives `.pb-mobile-nav`. |
| `--vb-toast-inset-bottom` | Bottom edge of the toast region — the nav height plus 0.75 rem, or 1.5 rem on desktop. |
| `--vb-toast-max-width` | 26 rem; the region is centred in the viewport. |
| `--vb-toast-z` | 60 — above the nav and its popover, both at `z-50`. |

The only producer today is `hooks/useSettings.ts`: `updateSettings()` compares
old and new values and emits one success toast per key that actually changed,
naming the new state (*"Autoplay audio on"*). Copy comes from an optional label
map with a humanised-key fallback, so a new `UserSettings` field is confirmed
without being registered. A `localStorage` write that throws produces an error
toast and leaves the setting unapplied.

## Accessibility

Implemented deliberately, not incidentally:

- Skip-to-content link, and `<main tabIndex={-1}>` focused on every route change.
- `RouteAnnouncer` sets `document.title` and announces the page name through an
  `aria-live="polite"` region — the "new page" signal an SPA otherwise loses.
- The activity heatmap has a **"View activity as a list"** text alternative
  (**observed**).
- Entry tabs use proper `role="tab"` / `aria-controls` wiring (`Tabs.tsx`).
- Review announces card position, reveal, and rating; offline and
  auto-graduation notices are `role="status"`.
- Settings changes are confirmed through the toast region's polite live region
  (see **Toasts**), not by moving focus.
- Interactive targets are ≥ 44 px (`min-h-11` / `min-h-12` throughout), with
  `focus-visible` outlines rather than suppressed focus rings.
- German content is marked `lang="de"`.
- Quota and progress bars carry `role="progressbar"` with `aria-valuenow`/`max`.

## PWA

`vite-plugin-pwa`, `registerType: 'autoUpdate'`. Standalone display, maskable
icons at 192/512, apple-touch-icon. Workbox runtime caching:

| Pattern | Strategy |
| :--- | :--- |
| `/api/v1/reviews/due` | NetworkFirst, 3 s timeout, 20 entries, 1 day |
| `/api/v1/dictionary/` | NetworkFirst, 3 s timeout, 200 entries, 7 days |
| audio and image requests | CacheFirst, 300 entries, 30 days |

Together with the IndexedDB review queue (`learning.md`), that is what makes a
review session survive going offline.

## Data layer

TanStack Query over a single axios instance with `baseURL: '/api/v1'` (Vite
proxies `/api` to port 3000 in dev; nginx proxies it in production). Almost every
response is parsed through its `@vocabahn/shared` Zod schema in `api.ts`, so a
contract break fails loudly at the boundary.

Vite aliases `@vocabahn/shared` to the package's **TypeScript source**, because
the built `dist` is CommonJS for NestJS while the browser needs ESM. Shared-schema
edits hot-reload.

`__APP_VERSION__` is injected from the root `package.json`, rendered in the
footer, and linked to the changelog on GitHub. A polled health dot
(5 s interval) sits beside it.

## Limitations

- **No 404 route** (#28). An unmatched path under a signed-in user renders the shell
  with an empty content area.
- **No route for the email magic link** (#13) — see `accounts.md`.
- The `offline-pack` endpoint has **no client consumer** (#23). There is no download
  control anywhere in the UI, so the top-1000 pack is unreachable
  (`dictionary.controller.ts`).
- Test coverage is thin (#28): 88 Vitest cases across 16 files (with `jest-axe`
  wired up in `src/test/`), and 18 Playwright specs across `landing`,
  `dictionary`, `review`, `story`. Most routes and every error path are
  untested.
- The toast region's clearance of the mobile nav rests on the CSS custom
  properties above, not on a rendered check — jsdom has no layout, and no
  Playwright spec covers a 375 px viewport.
- (#28) The PWA manifest hardcodes `theme_color: '#0a0a0a'` (dark) while `theme.ts`
  updates the meta tag dynamically, so an installed app's chrome does not follow
  the light theme.
- The review route binds arrow keys on `window` for its whole lifetime — no
  focus scoping (`learning.md`).
- `DictionaryCard.tsx` is 1135 lines holding the search page, entry page,
  entry body, all five tab panels, four morphology table renderers, the audio
  button, and the feedback widget. `EntryBody` is imported by `ReviewSession`, so
  the file is on the critical path for two routes.
- (#27) The dashboard is a vertical stack of full-width sections, not the bento grid
  the legacy backlog describes (**observed**).
- Landing-page copy advertises studying offline and PWA install; both are real,
  but the offline *dictionary* pack it implies is the orphaned endpoint above.
