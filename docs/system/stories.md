# Micro-stories

A short German text, retold from a real German news article on a subject the
learner chose, using the words they are currently studying. The learner reads
it, taps any studied word to see its entry, and marks the ones that didn't land.

Code: `apps/api/src/stories/`, `apps/web/src/components/StoryPage.tsx`,
`apps/web/src/components/StoryWord.tsx`, `apps/web/src/lib/story-text.ts`,
`packages/shared/src/story.ts`, `apps/api/src/sources/` for the articles
(`sources.md`), `apps/api/src/tts/` for narration, and `apps/api/src/images/`
for the illustration.

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
4. The learner reads, marks the words that didn't land, and finishes.
   `POST /stories/:id/complete` writes `understood` on every target.

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

No article is picked at all when the learner wrote their own idea into
`Story.prompt`: retelling an unrelated headline would ignore what they actually
asked for, so a prompted story is always fiction.

## Grounding and Continuity

`buildStoryPrompt` (`story-prompt.ts`, pure and unit-tested) supports four shapes:

- **With a user prompt** (`Story.prompt`, up to 500 chars) — center the story on
  the learner's requested scenario, plot idea, or characters (e.g. "A detective
  in Berlin looking for a lost cat"), still at the target CEFR level and still
  using the studied words. It outranks the other three shapes, and a story that
  has one never has a source.
- **With a source** — retell this item. The fact rules are stated to outrank
  every other instruction: use only what the headline and summary state, add no
  names, numbers, dates, causes or consequences that are not there, write
  shorter rather than padding with invention, no speculation, no opinion, and do
  not copy sentences verbatim.
- **With a topic but no source** — invent a scene about the subject, explicitly
  not presented as real news and not using the names of real living people,
  teams or companies in the news.
- **With neither** — the original untethered story.

**Narrative Continuity**: The processor queries up to 3 recent ready stories for
the learner and supplies their titles, topics, prompts, and short excerpts to the
prompt. Gemini is instructed to weave subtle callbacks (recurring characters,
familiar places, or thematic motifs) to create an evolving world, while keeping
each new story fully self-contained.

A sourced story runs at `temperature: 0.4` rather than 0.8. Inventing is a
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

Nothing yet tells the learner it exists. Web Push now exists in the codebase
(`notifications.md`) but nothing in this sweep calls it — the
`TODO(notifications)` in `story-digest.processor.ts` still stands. The
dashboard's "Today's read" card and `GET /stories/latest` are how it is found.

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

## Looking a word up mid-story

`StoryWord.tsx` renders each target as a trigger with a popover holding what the
story already knows about the entry: emoji and headword, part of speech, CEFR
level, translation and first sense gloss, one example sentence, a pronunciation
button, a **Didn't land** toggle, and a link through to `/word/:word`.

**Nothing is fetched.** `StoryTarget` carries `pos`, `cefrLevel`, `gloss`,
`audioUrl` and one `example`, read straight off the persisted `DictionaryEntry`
in `storyInclude`. Going through `DictionaryService.getEntry` would trigger lazy
enrichment (`enrichment.md`), so a reader running the mouse across a paragraph
could spend their whole daily quota on words they only glanced at. Enrichment is
lazy, so a target can arrive with nothing but a headword and a translation —
those fields are then null and the popover shows what it has.

**Looking is not marking.** Opening the popover records nothing; `understood`
only moves when the toggle inside it is pressed. Before this the same click did
both, so every curious glance wrote to the feature's only comprehension signal.
On touch that makes tap open the popover rather than mark the word.

It is deliberately not the shared `FollowTooltip` (`web-client.md`), which is
read-only and never takes focus. This one holds controls, so it is a
`role="dialog"` popover: hover or keyboard focus opens it, Escape closes it and
hands focus back to the word, and it is a DOM sibling of the trigger — not a
portal — so Tab walks straight into it. It is positioned `absolute` against the
word rather than `fixed`, because the story container carries a GSAP transform
that would re-root a fixed descendant, and it is shifted back horizontally and
flipped above the line when the viewport edge is in the way.

A marked word stays amber in the running text with the popover closed, and
carries `aria-describedby` pointing at one shared visually-hidden note — a
description, so the trigger's accessible name stays the German surface form.

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

## Illustration

One Unsplash photo per story, rendered above the German as a 16:9 banner. It
gives the reader a scene to anchor on before decoding the text, which is the
comprehensible-input effect the whole feature is for.

The search query is the hard part and the model supplies it. `imageQuery` is a
required field on the same structured response that returns the text — 2 to 4
concrete English nouns naming what a photograph of the scene would show. There
is no second AI call. Unsplash is English-keyword-driven, so searching on the
German title or body returns junk; when the field is missing the English
`translation` is used instead, and when there is no English at all the search is
skipped.

`orientation=landscape`, against the dictionary's `squarish` — a banner and a
thumbnail want different photographs, not one photograph cropped twice.

The fetch runs through the processor's `safe()` wrapper next to the TTS call and
inherits the same policy: **a failed image costs the learner the picture, never
the story or their quota.** An unset `UNSPLASH_ACCESS_KEY`, a timeout, an API
error and a search that matched nothing all end the same way — `imageUrl` null
and the story `READY`.

Attribution is stored inline on the story (`imageAuthorName`, `imageAuthorUrl`,
`imageSourceUrl`) rather than through `ImageCredit`, which is hard-bound to
`DictionaryEntry` by a unique required relation. The web credit line is the
shared `UnsplashCredit` component, the same one the dictionary card uses, which
is where the UTM parameters Unsplash requires are applied (`enrichment.md`).

`Story.image` is null for every story generated before this shipped. The page
treats that as an ordinary state: nothing renders, and because the aspect ratio
is fixed on the `<img>` itself, nothing below it moves when the file arrives.

## Word-by-Word Interactions and FSRS Evaluation

Every word in the story is matched to dictionary entries and rendered interactively:
- **Hover highlighting**: Hovering over any word highlights it.
- **Clicking a word (`CLICK_HARD`)**: When a learner clicks a word to inspect its dictionary popover, it indicates uncertainty and triggers a review evaluation marking the word as `ReviewRating.HARD` in FSRS, recording a `ReviewLog` and recomputing their knowledge score.
- **"I don't know this word at all" (`DONT_KNOW_AGAIN`)**: Within the popover, clicking this button marks the word as unknown (`understood: false`) and updates the flashcard in FSRS with rating `ReviewRating.AGAIN`.
- **Story Validation Quiz**: Each generated story includes 3–4 context-aware multiple-choice quiz questions specifically targeting the studied words used in the story.
  - While reading, the learner can tap "Take Story Quiz" to step through the interactive quiz questions.
  - Submitting quiz answers (`POST /stories/:id/complete` with `quizAnswers`) grades the responses on the server.
  - For each answered question, `StoryQuizAttempt` is stored, the corresponding `Card` is updated in FSRS with `ReviewRating.GOOD` (if answered correctly) or `ReviewRating.AGAIN` (if answered incorrectly), a `ReviewLog` snapshot is written, and the learner's knowledge score is recomputed.
- **`StoryTarget.understood`**: Stores the comprehension signal (`false` for unlearned words, `true` for understood words upon story completion).

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
| `UNSPLASH_ACCESS_KEY` | — | Unset means no illustration. The story is unaffected. |

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
  it exists, and it is superseded the next morning. The push machinery it would
  use is now built (`notifications.md`) and deliberately not wired here — the
  daily reminder was shipped alone rather than as a campaign engine.
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
- Nothing checks that the illustration matches the story. The model's
  `imageQuery` is passed to Unsplash and the top result is taken on trust, so a
  vague query can put a generic stock photo above a specific text.
- The illustration is fetched once, at generation time, and the chosen photo's
  URL is stored. Nothing re-checks or re-fetches it: if Unsplash later removes
  the photo the figure disappears on the client and the story keeps no record
  that it ever had one.
- The word popover shows the first sense gloss and one example. The usage note,
  collocations, false friends, mnemonic and image are still only on the entry
  page, behind **Open in dictionary**.
- A target whose entry has never been enriched shows a headword, a translation
  if one exists, and the two buttons. Nothing offers to enrich it from here, by
  design — the story view must not spend quota.
- The popover's placement is computed in `StoryWord.tsx` rather than by the
  native Popover API or a positioning library: jsdom has neither, so the native
  route could not be covered by the Vitest suite, and no positioning library is
  in `apps/web/package.json`. The 375 px clamp is verified by a Playwright spec
  instead, which CI does not run.
- The popover does not trap focus: Tab past its last control leaves it and
  closes it. Deliberate — reading should continue — but it is not modal-dialog
  behaviour despite `role="dialog"`.
- Stories accumulate; nothing prunes old rows.
- `completedAt` can be rewritten by calling `complete` again — the endpoint is
  idempotent by overwrite, not append. There is no history of a learner's
  changing answers on one story.
- `/story` is still reached through the More menu. The dashboard's "Today's read"
  card is the practical entry point; the nav was left alone.
