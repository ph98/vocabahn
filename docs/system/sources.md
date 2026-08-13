# Source material

German publisher feeds, polled on a schedule, so a story can retell something
that actually happened rather than invent one.

Code: `apps/api/src/sources/`, taxonomy in `packages/shared/src/topics.ts`.

## Why it exists

A generated story about nothing gives a learner no reason to open the app that
their study habit wasn't already supplying. A story about the match they were
going to read about anyway does. The topic is the draw; the vocabulary practice
rides along.

## Topics

`STORY_TOPICS` (`packages/shared/src/topics.ts`) is the contract: nine slugs,
each with a label and an emoji. `User.interests` and `Story.topic` hold these
slugs, and `TOPIC_FEEDS` (`sources.constants.ts`) maps each to its feeds.

| Topic | Feed | Publisher |
| :--- | :--- | :--- |
| `news` | `tagesschau.de/index~rss2.xml` | tagesschau |
| `germany` | `tagesschau.de/inland/…` | tagesschau |
| `world` | `tagesschau.de/ausland/…` | tagesschau |
| `business` | `tagesschau.de/wirtschaft/…` | tagesschau |
| `football` | `newsfeed.kicker.de/news/aktuell` | kicker |
| `sport` | `sportschau.de/index~rss2.xml` | Sportschau |
| `technology` | `heise.de/rss/heise-atom.xml` | heise online |
| `science` | `wissenschaft.de/feed/`, `spektrum.de/…` | wissenschaft.de, Spektrum |
| `everyday` | — | none |

`everyday` has no feed on purpose: there is no news wire for ordinary life, so
that topic generates unsourced fiction. A topic without a feed is a supported
state, not a gap.

**Observed** 2026-08-12: all eight feeds returned items, 419 parsed and 157
stored after filtering.

## What is stored, and what is not

Only the feed's own `<title>` and `<description>` — the precis the publisher
syndicates for exactly this purpose. The article body is never fetched, never
stored, and never reproduced. A story *retells* the item in the learner's own
level and links back to the original with the publisher named.

`SOURCE_MIN_SUMMARY_CHARS` (120) drops bare headlines and paywall teasers: a
one-line summary gives the model nothing to ground a hundred-word retelling in,
and a model with nothing to ground on invents.

## The refresh job

`SourceProcessor` registers one repeatable BullMQ job (`source-refresh`) at
boot, every `SOURCE_REFRESH_INTERVAL_MS` (2 h). The fixed `jobId`
(`source-refresh-repeat`) makes registration idempotent across restarts and
across API replicas — every replica registers on boot, and BullMQ keeps one
scheduler per key, so N replicas do not produce N polls.

A fresh deploy has an empty table and the first repeat a full interval away, so
`onModuleInit` also enqueues an immediate refresh when `hasFreshItems()` is
false.

Each feed is fetched and caught individually: one publisher returning a 500 or
timing out costs that topic its update, never the whole sweep.

## Parsing

`parseFeed` (`feed-parser.ts`, pure and unit-tested against captured responses
from each publisher) normalises RSS 2.0 and Atom into the same shape. Three
things carry the correctness:

- An element with attributes parses to an object, not a string — heise ships
  `<title type="html">`, which yields `"[object Object]"` if read naively.
- Atom links are `href` attributes and a feed may carry several; the article is
  the one with `rel="alternate"` or no `rel` at all.
- A tag that appears once parses to an object rather than an array, so a
  single-item feed is the case a naive `.map` breaks on.

Items missing a title, a link, or a parseable date are dropped rather than
guessed at — undated items cannot be ordered by recency, and unlinked ones
cannot be attributed.

## Picking an item

`pickForUser` returns the newest item on the topic, published within
`SOURCE_MAX_AGE_DAYS` (4), that this learner has not already been given. "Already
given" is read off `Story.sourceItemId` over the learner's last 200 stories.

Returning null is normal — no feed for the topic, refresh has never run, the
learner has read everything recent — and the caller handles it by generating
without a source rather than failing.

## Retention

Items older than `SOURCE_RETENTION_DAYS` (14) are deleted on each refresh.
Stories snapshot their attribution (`Story.sourceTitle/sourceUrl/sourceName/
sourcePublished`), so pruning never blanks the credit on a story a learner
already read; the `sourceItemId` relation is `onDelete: SetNull`.

## Limitations

- Feed URLs are hardcoded in `sources.constants.ts`. A publisher changing its
  feed path is a code change, and nothing alerts on a feed that has quietly
  returned zero items for a week.
- One item belongs to exactly one topic, decided by which feed it arrived on.
  The same tagesschau piece can legitimately be both `news` and `germany`, and
  is stored twice under different URLs only if both feeds carry it — otherwise
  a learner interested in `germany` never sees it.
- `pickForUser` always takes the newest unread item, so every learner on a topic
  reads the same article. There is no per-learner variety beyond what their
  reading history already excludes.
- Nothing checks that a feed item is appropriate for a language learner. A
  distressing news item is retold as readily as a football result.
- The 200-story dedup window is a bound, not a guarantee. A learner who somehow
  exceeds it within the retention window could be shown a repeat.
- `SourceItem` rows are shared across all learners but pruned on a global
  schedule, so a learner returning after two weeks sees only current items — the
  backlog they missed is already gone.
