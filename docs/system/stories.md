# Micro-stories

A short German text, retold from a real German news article on a subject the
learner chose, using the words they are currently studying. The learner reads it
and taps the words that didn't land.

Code: `apps/api/src/stories/`, `apps/web/src/components/StoryPage.tsx`,
`apps/web/src/lib/story-text.ts`, `packages/shared/src/story.ts`,
`apps/api/src/sources/` for the articles (`sources.md`), and `apps/api/src/tts/`
for narration.

This is the only place a learner interacts with an LLM directly. Everywhere else
AI runs behind the scenes (`enrichment.md`).

## The flow

1. `POST /stories` checks the daily quota, resolves a topic, picks a source
   article for it, picks up to `STORY_TARGET_COUNT` (8) words, writes a `Story`
   row in `PENDING` with one placeholder `StoryTarget` per word, and enqueues a
   job on the `story` BullMQ queue.
2. The response returns immediately. The client polls `GET /stories/:id` every
   4 s while the status is `PENDING` or `GENERATING` — the same idiom the
   dictionary uses for enrichment. There is no SSE and no WebSocket.
3. `StoryProcessor` (in-process, concurrency 2) sets `GENERATING`, calls Gemini,
   verifies the result, synthesizes narration, replaces the placeholder targets
   with verified ones, and sets `READY`.
4. The learner reads, taps words, and finishes. `POST /stories/:id/complete`
   writes `understood` on every target.

## Topics and sources

`Story.topic` is a slug from `STORY_TOPICS` (`packages/shared/src/topics.ts`).
`StoriesService.resolveTopic` takes what the learner asked for, else samples one
of their `User.interests`, else null. Sampling rather than taking the first
interest keeps a learner with three topics from getting the same one every day.

An unknown slug is dropped rather than rejected — the taxonomy can shrink
between a client build and the server, and a stale chip should not fail a
request.

With a topic, `SourcesService.pickForUser` supplies the newest article the
learner hasn't read (`sources.md`). Its attribution is **snapshotted onto the
story** (`sourceTitle`, `sourceUrl`, `sourceName`, `sourcePublished`) rather than
read through the relation, so retention pruning cannot blank the credit on
something already read.

The article is picked when the row is created, not in the processor, so a retry
re-reads the same article instead of silently swapping it under a learner
mid-generation.

## Grounding

`buildStoryPrompt` (`story-prompt.ts`, pure and unit-tested) has three shapes:

- **With a source** — retell this item. The fact rules are stated to outrank
  every other instruction: use only what the headline and summary state, add no
  names, numbers, dates, causes or consequences that are not there, write
  shorter rather than padding with invention, no speculation, no opinion, and do
  not copy sentences verbatim.
- **With a topic but no source** — invent a scene about the subject, explicitly
  not presented as real news and not using the names of real living people,
  teams or companies in the news.
- **With neither** — the original untethered story.

A sourced story also runs at `temperature: 0.4` rather than 0.8. Inventing is a
creative task; retelling is closer to extraction, and every degree of freedom
there is a degree of freedom to invent a fact.

The two goals genuinely conflict: eight prescribed words may not all fit a real
article. The prompt resolves it explicitly — accuracy first, omit any word that
would need something invented, aim for five rather than all eight.

**Observed** 2026-08-12, a kicker report on the UEFA Supercup retold at B2.1:
every claim in the output traced to the summary, no invented score or scorers,
4 of 8 target words verified, narration synthesized, ~30 s end to end.

## When the source doesn't work out

On the **final** attempt the processor drops the source and generates a topical
story instead. A thin summary plus eight prescribed words can leave too few
words placeable, and a readable story on the right subject beats a `FAILED` one.

When that happens the snapshot fields and `sourceItemId` are cleared in the same
write that stores the text. The story must not credit an article it was no
longer based on, and releasing the link leaves the item eligible for that
learner's next story rather than burning it on one they never read.

## Choosing the words

`StoriesService.selectWords` mirrors how a review session is built
(`learning.md`): due `ACTIVE` cards first, ordered by `due` ascending, then new
cards ranked by `KnowledgeService.orderByPrior` lowest-prior-first.

It differs in one way: targets are restricted to content words
(`STORY_CONTENT_POS` — `noun`, `verb`, `adj`, `adv`). A due queue full of
prepositions and conjunctions produces a story peppered with tappable *von* and
*für*, and "I didn't understand *von*" is not a signal anyone can act on. When
fewer than `STORY_MIN_TARGETS` (3) content words are available the filter is
dropped and whatever the learner is studying is used instead.

The story is written for `User.cefrLevel`, falling back to `A2.1` when the level
has not been inferred yet.

## The daily story

`StoryDigestProcessor` registers one repeatable job on the `story-digest` queue
at `0 * * * *` — hourly, with a fixed `jobId` so restarts and replicas do not
multiply it. Each sweep generates for whichever learners have just reached their
own digest hour, so the story is waiting when they wake up rather than something
they have to ask for and then sit through.

`isDigestHour` (`digest-schedule.ts`, pure and clock-injected, unit-tested)
answers whose morning it is. `STORY_DIGEST_HOUR` defaults to 7. A learner with no
stored timezone falls back to UTC rather than being skipped; one whose stored
timezone Intl cannot parse is skipped rather than taking the sweep down.

Three things bound the cost and keep it exactly-once:

- Candidates are limited to learners with an `ACTIVE` card and a review within
  `STORY_DIGEST_ACTIVE_DAYS` (14). Each story is a paid model call, and writing
  one every morning for an account nobody opens spends the budget on nothing.
- `story:daily:<userId>:<localDateKey>` is claimed with Redis `SET NX` (36 h
  TTL). Whichever replica arrives first generates; a sweep that runs twice in an
  hour writes one story.
- One learner's failure is caught and logged, so it cannot stop the sweep for
  everyone else whose morning it also is.

A daily story carries `origin: DAILY` and **does not spend the manual quota** —
it is a gift, not a withdrawal, so a learner who used all ten yesterday still
wakes up to one.

Nothing yet tells the learner it exists. Push notifications are the intended
mechanism and are marked `TODO(notifications)` in `story-digest.processor.ts`;
until then the dashboard's "Today's read" card and `GET /stories/latest` are how
it is found.

## Finding the story again

`GET /stories/latest` returns the learner's most recent unfinished, non-failed
story, or null. It exists because a scheduled story is created on no device at
all — the browser that would have remembered its id was closed at the time. It
incidentally carries an unfinished story across browsers, which the
`localStorage` id alone never could.

The client keeps the `localStorage` id as a fast path (and as the only way to
follow a story that is still `PENDING` immediately after creation) and falls back
to `/latest`.

## Verified surface forms

Gemini returns the story text plus, per word, the inflected `surfaceForm` as it
claims to have written it. Nothing guarantees the claim is true — the model can
paraphrase, and a target the reader cannot find would render as a highlight over
the wrong word.

`validateTargets` (`story-targets.ts`, pure and unit-tested) therefore drops any
claim whose `surfaceForm` does not literally occur in the text, and any headword
that wasn't supplied. If fewer than `STORY_MIN_TARGETS` survive, the processor
**throws**, so BullMQ regenerates with backoff rather than shipping a story with
nothing worth tapping.

Observed hit rate on a B2 word set: 8 of 8 claims verified across three
consecutive generations, ~7–8 s per story.

## Rendering tappable words

`segmentStory` (`apps/web/src/lib/story-text.ts`) splits the text into plain
runs and target runs. It is deliberately **not** a tokenizer — the server has
already proved each surface form occurs verbatim, so matching those exact
strings is enough and avoids taking a position on German compounding.

Two details carry the correctness:

- Alternatives are sorted **longest first**, so `Hausaufgaben` wins over the
  `Haus` nested inside it.
- Word boundaries use `(?<!\p{L})…(?!\p{L})` rather than `\b`, because `\b` is
  ASCII-only in JavaScript and splits on umlauts and ß.

A word occurring twice yields two tappable spans sharing one target.

## Narrating the wait

`Story.stage` is `WRITING` or `NARRATING`, and is only reported while the status
is `PENDING` or `GENERATING`. The wait runs 20–35 s, which is long enough that an
unlabelled spinner reads as a hang; naming the step also makes it visible that
the text is finished well before the narration is.

Source selection is deliberately **not** a stage — it happens synchronously when
the row is created, so no learner ever waits on it. The headline is therefore
known from the first poll and is shown during the wait, which gives the learner
something to read instead of a bare skeleton.

## Narration

The whole German text is synthesized once per story through the shared
`TtsProvider` (`apps/api/src/tts/`, ElevenLabs with a Google TTS fallback), keyed
`story-<storyId>` and served from `/api/static/audio/`. `Story.audioUrl` holds
the path, or null.

It runs through the processor's `safe()` wrapper, exactly as enrichment treats
images and audio: a TTS outage costs the learner their narration, never the
story or the quota they already spent. The web player hides itself when
`audioUrl` is null and degrades to a plain message if the file fails to load.

Two details make story-length text work where the per-word path did not:

- The ElevenLabs request timeout scales with input length
  (`min(60s, 10s + chars × 40ms)`). The old flat 10 s was sized for a single
  headword and a ~500-character story routinely exceeded it, silently
  downgrading every story to the Google fallback.
- `StaticAudioController` recognises the `story-<id>` key and can re-synthesize
  from `Story.text` on demand, so a missing file (fresh volume, manual cleanup)
  self-heals the same way dictionary audio does. **Observed**: deleting the mp3
  and re-requesting it returns a fresh 200.

## The comprehension signal

`StoryTarget.understood` is the record: `false` for a word the learner tapped,
`true` for every other target in a completed story, `null` until completion.
`respondedAt` timestamps it.

**Nothing consumes this.** It feeds neither FSRS nor `KnowledgeScore`, and
tapping a word changes no card's schedule. The rows exist so the signal can be
designed from real data rather than speculation — see `docs/adr/0001`, which
proposes an evidence ledger that does not exist.

## Quota

`story:cap:<userId>:<dateKey>` in Redis, `INCR` with a rolling 24 h TTL, capped
by `STORY_DAILY_CAP` (default 10, `STORY_DAILY_CAP` env var). Consumed after the
row is created, before the job is enqueued.

Unlike enrichment, which silently skips over its cap, exceeding this one throws
a `ForbiddenException` — the learner explicitly asked for a story, so silence
would read as a bug.

## Configuration

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `STORY_DAILY_CAP` | 10 | On-demand stories per learner per day. Daily stories are exempt. |
| `STORY_DIGEST_HOUR` | 7 | Learner-local hour the daily story is written for. |
| `STORY_DIGEST_ACTIVE_DAYS` | 14 | Days since last review before a learner is treated as dormant and skipped. |
| `SOURCE_REFRESH_INTERVAL_MS` | 7200000 | How often publisher feeds are re-polled (`sources.md`). |
| `GEMINI_API_KEY` | — | Unset disables generation entirely; the job throws and the story fails. |

## Limitations

- Story targets are only as good as the learner's cards. Capitalized function
  words that resolved to rare substantivized noun senses (`Wenn` → "if",
  `Haben` → "assets or wealth", `Hier` → "here") pass the content-word filter
  because the lexicon genuinely tags them `noun`, and they surface as targets.
  The cause is upstream in lemma resolution, not here. **Observed** on a B2.1
  account with 3,303 active cards: all four verified targets in one sourced
  story were function words (`werden`, `nach`, `wissen`, `doch`), which is a
  legitimate pass of the `noun`/`verb`/`adj`/`adv` filter and a poor read.
- Nothing verifies the generated German actually sits at the requested CEFR
  level. The level is passed to the model and trusted.
- **Nothing verifies the retelling is faithful to its source.** The prompt states
  the fact rules emphatically and the temperature is lowered, but no second pass
  checks the output against the summary. A learner reading a sourced story is
  being told something factual about the world on the model's word alone.
- Weaving prescribed words into a real article pulls against accuracy, and the
  prompt resolves it by dropping words. Sourced stories therefore verify fewer
  targets than invented ones, and can still pad slightly to fit a word in.
- The daily story is written but not announced: `TODO(notifications)` in
  `story-digest.processor.ts`. A learner who does not open the app never learns
  it exists, and it is superseded the next morning.
- The digest sweep reads every candidate learner each hour and filters in
  application code. Fine at current scale, linear in active learners.
- A daily story is generated whether or not the learner will read it, so a
  learner active in the last 14 days but dormant this week still costs one model
  call a day.
- Narration is synthesized before the story is marked `READY`, which is the
  larger half of the 20–35 s wait — the text is finished and readable well
  before the learner sees it. `Story.stage` now names which half they are in,
  but does not shorten either.
- Narration is generated for every story whether or not anyone plays it, and a
  ~500-character story is ~500 ElevenLabs characters against that quota.
- The player has no seek, no playback speed, and no sentence-level highlighting
  to follow along with.
- Quota is consumed on enqueue. A story that fails all three attempts still cost
  the learner one of their ten.
- Stories accumulate; nothing prunes old rows.
- `completedAt` can be rewritten by calling `complete` again — the endpoint is
  idempotent by overwrite, not append. There is no history of a learner's
  changing answers on one story.
- `/story` is still reached through the More menu. The dashboard's "Today's read"
  card is the practical entry point; the nav was left alone.
