# Web Client

The SPA: routing, navigation, theming, motion, gestures, accessibility, and PWA
behaviour.

Code: `apps/web/src/App.tsx` (771 lines — shell, nav, and route table),
`apps/web/src/components/`, `apps/web/src/hooks/`, `apps/web/src/lib/`,
`apps/web/vite.config.ts`.

## Shell

`App.tsx` gates on `useSession()` (`hooks/useSession.ts`), which turns the
`['me']` query into one of five answers. There is no router guard: the routes
simply are not mounted unless the session says so.

| Status | Shown |
| :--- | :--- |
| `loading` | Nothing yet — the first check has not settled |
| `anonymous` | `LandingPage` plus the Google One Tap prompt |
| `authenticated` | `AppNav` and the route table |
| `unreachable` | `ServerUnreachableState` — see **Errors** |
| `offline` | `OfflineState`, for a device with no connection and no known user |

The distinction between `anonymous` and `unreachable` is the point. `fetchMe()`
answers `null` — signed out — only for a 401 the silent refresh could not
rescue; a refused connection, a 5xx or a throttler 429 throws
`ApiUnavailableError` instead (`accounts.md`). Anything else would render the
marketing page at a signed-in user mid-session, over a session cookie that is
still perfectly valid.

Nothing about an outage clears client state. The last known user is kept, the
router is untouched, and the IndexedDB review queue is not involved at all, so
recovery puts the user back on the same route with the same session. Recovery
is automatic: the footer's `/health` poll is already running (it lives outside
every auth branch), and the outage page watches it rather than starting a
second loop — when the API answers again, the session is re-checked once.

Retry lives on the query, not in the return value: `installSessionQueryDefaults`
(called from `main.tsx`) gives `['me']` three retries with exponential backoff
and no retry at all against a 4xx. It is a query default rather than a
`useQuery` option because several components observe `['me']` and per-observer
retry settings would disagree about a shared fetch. A 429 is treated as pacing
rather than an outage: it backs off, and never takes an already-signed-in user
out of the app.

Routes, all lazy-loaded behind one `RouteBoundary` — suspense fallback plus an
error boundary, see **Errors** — except the dictionary, profile, and landing
pages:

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

`FollowTooltip.tsx` is the one hover/focus tooltip in the app — a GSAP-eased
overlay that follows the pointer, or anchors above the trigger when opened by
keyboard focus, and closes on Escape. It is deliberately **non-interactive**:
read-only text, `pointer-events: none`, no focus trap. The activity heatmap and
the progress bars both use it. Anything needing focusable controls inside the
overlay wants a popover, not this.

`StoryWord.tsx` is the other side of that line and the only popover in the app:
an entry summary anchored to a studied word in a story, holding an audio button,
a dictionary link and a toggle. Because it has controls it is `role="dialog"`,
it is a DOM sibling of its trigger so Tab reaches them, and it keeps its own
placement (shift back from the viewport edge, flip above the line) rather than
stretching `FollowTooltip` to cover both jobs. Its entrance is CSS
(`.vb-word-popover` in `index.css`), switched off under `prefers-reduced-motion`
alongside the toast's. See `stories.md`.

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

## Safe-area utilities

The four safe-area helpers — `px-safe`, `pt-safe`, `pb-safe`, `pb-mobile-nav` —
are declared with Tailwind's `@utility` at-rule, not as plain classes in
`@layer utilities`. That distinction is load-bearing: Tailwind only generates
variants for utilities it has been told about, so as hand-written rules they
worked bare but produced *nothing* for `md:pb-safe` or `max-md:pb-mobile-nav`.
The app shell uses exactly those two, so every signed-in user silently lost
their bottom padding until #87. Each utility nests its own `640px` step, so a
variant carries the step with it, and `src/test/safe-area-utilities.test.ts`
compiles `index.css` and asserts the variants are emitted.

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
- Course and deck progress bars are `role="img"` with an `aria-label` naming all
  three bucket counts; the same counts are also visible text in the legend
  beside the bar, whose entries are the keyboard-reachable tooltip triggers.
  Nothing in the app uses `role="progressbar"`.

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
footer, and linked to the changelog on GitHub. A polled health dot sits beside
it: `hooks/useHealth.ts`, 5 s interval, `retry: false` so one failed check does
not become four. That poll is the app's only one — `useHealthSignal()` reads its
result without issuing a request of its own, which is how the outage page knows
when to try again.

The footer wraps at narrow widths and carries, in order: Help & User Guide, the
version/changelog link, Terms, Privacy Policy, a **"Source on GitHub"** link to
the repository root, and the health dot. The repository wording is deliberate —
the project is licensed PolyForm Noncommercial 1.0.0, which forbids commercial
use and is not OSI-approved, so the footer says "source", never "open source".
The GitHub mark is inlined as an SVG because `lucide-react` v1 dropped its brand
icons, and the link carries a visible text label rather than relying on
`aria-label`.

## Errors

`src/components/errors/` is the whole error surface. One presentational
component, `ErrorState`, backs every state — rounded icon tile, optional code
eyebrow, heading, muted explanation, actions — and the named states are its
usages, not templates to copy. Each renders standalone: no router error, no app
nav, no signed-in user, so a signed-out visitor sees the same page.

| State | Shown when |
| :--- | :--- |
| `RouteNotFoundState` | A URL with no route. `NotFoundPage` is this and nothing else |
| `ResourceNotFoundState` | The route exists but the deck / course / word does not |
| `ForbiddenState` | 403 — someone else's private deck |
| `ServerErrorState` | 5xx, or an uncaught render error |
| `ServerUnreachableState` | The API never answered — including at the auth gate |
| `OfflineState` | The device has no network |
| `NewVersionAvailableState` | A dynamic import failed because this tab is on an old build |
| `MaintenanceState` | Planned downtime, when something says so |

`classifyError(error)` is the single mapping from a thrown value to one of
these, so a 403 from any endpoint lands on the same page; `ErrorStateForError`
renders the result. Order matters inside it: a status code proves the network
worked and wins over the offline check, and a failed module import while
offline is an offline problem rather than a stale deploy.

Every state has a full-page form and a compact `inline` form, so a panel that
fails inside a working page does not blow away the screen. The full-page form
renders the `<h1>` and moves focus to it on mount — the same "you are somewhere
new" signal `RouteAnnouncer` gives for ordinary navigation. Entrance motion goes
through `lib/motion`, so nothing animates under `prefers-reduced-motion`.

The auth gate is the one caller that reaches for a state directly rather than
through `classifyError`: it already knows the shape of what failed, and it
needs `ServerUnreachableState`'s retry affordances (`isRetrying`,
`retryInSeconds`, `autoRetrying`) wired to the health poll. A gate failure that
is *not* an `ApiUnavailableError` — a response that would not parse, say — goes
through `ErrorStateForError` instead, because "we can't reach the server" would
be a lie about it.

Two boundaries make throws reachable. `RouteBoundary` wraps each lazy route
tree (it owns the `Suspense` fallback as well) and clears itself when the
pathname changes, so a link out of an error page works. `AppErrorBoundary` sits
above the shell in `main.tsx` for a throw in `App` itself, where there is no
`<main>` left to render into. Both report to Sentry through `trackError`, which
returns the event id so `ServerErrorState` can print a reference a support
request can be matched against.

The failure this is built for is the redeploy. With `registerType: 'autoUpdate'`,
a tab holding the previous build's `index.html` asks for a content-hashed chunk
that no longer exists; the `lazy()` import rejects with a browser-specific
"failed to fetch dynamically imported module". `classifyError` recognises that
shape and answers with `NewVersionAvailableState`, whose single action asks the
service worker for the new revision and then reloads (`lib/app-update.ts`) —
`skipWaiting` and `clientsClaim` are on, so it takes over immediately.

## Analytics

`lib/telemetry.ts` is the only path to GA4 and Sentry. `trackEvent` is generic
over the event map in `lib/analytics-events.ts`, so an unknown event name or a
wrong parameter shape fails typecheck; nothing is sent unless the environment
allows analytics *and* the visitor granted consent. `trackPageView` redacts
`/word/:word` and `/decks/:id` and drops the query string before reporting, in
`page_location` as well as `page_path` — otherwise gtag reads
`window.location` itself and attaches the headword, and the dictionary `?q=`
term, to every hit. Full taxonomy in `analytics.md`.

## Limitations

- **A signed-out visitor never sees the 404 page.** The signed-out route table
  ends in `<Route path="*" element={<LandingPage />} />`, so any unknown URL
  renders the marketing page instead. The 404 page itself works for signed-out
  visitors (its CTA says "Go to the home page", not "dashboard") — it is simply
  not routed to.
- **The offline state is wired only at the auth gate.** `useSession` shows
  `OfflineState` when the device is offline and no user has been confirmed
  yet; everywhere else `OfflineState` is still only reached from a failed
  request while `navigator.onLine` is false, not from a route-level check.
- **A signed-in user is taken out of the app during a backend outage**, even
  mid-review. Queued ratings survive in IndexedDB and sync on recovery, and the
  route is restored, but the in-memory position in a review session is not.
  Going *offline* is different: the last known user is kept and the routes stay
  mounted, which is what makes offline review work.
- **No route for the email magic link** (#13) — see `accounts.md`.
- The `offline-pack` endpoint has **no client consumer** (#23). There is no download
  control anywhere in the UI, so the top-1000 pack is unreachable
  (`dictionary.controller.ts`).
- Test coverage is thin (#28): __COUNT__ (with `jest-axe`
  wired up in `src/test/`), and 19 Playwright specs across `landing`,
  `dictionary`, `review`, `story`. Most routes are untested; of the error paths,
  only the boundary, the error states themselves, and the auth gate are covered.
  No end-to-end spec stops the API and watches the client recover — the outage
  path is covered at the unit and component level only.
- The toast region's clearance of the mobile nav rests on the CSS custom
  properties above, not on a rendered check — jsdom has no layout, and the one
  Playwright spec that measures at 375 px covers the story word popover, not the
  toasts.
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
