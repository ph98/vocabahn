# Enrichment

How a bare `DictionaryEntry` acquires a translation, examples, an image, and
audio. The highest-complexity flow in the repo and the only one that spends
money.

Code: `apps/api/src/enrichment/`, `apps/api/src/feedback/`, plus
`apps/api/src/images/` and `apps/api/src/tts/` for the two external providers it
shares with micro-stories.

## Laziness is the design

Nothing is bulk-enriched. Around 10k entries are promoted into the active
dictionary and left `PENDING` indefinitely. Paid APIs fire only when a user
actually opens a word. This diverges from the legacy PRD's bulk-seed pipeline
and is deliberate.

`DictionaryService.getEntry` calls `requestEnrichment` when the entry is:

- `PENDING`, or
- `FAILED` (a retry), or
- `ENRICHED` **but** `register === null` — a backfill trigger for entries that
  predate the learner-aid fields (collocations, false friends, register,
  mnemonic).

That third condition means opening old entries silently spends quota.

## Enqueue

`EnrichmentService.requestEnrichment` (`enrichment.service.ts`):

1. `jobId` is the `dictionaryEntryId`, so BullMQ dedupes one in-flight job per
   entry. An existing job in `waiting`/`active`/`delayed` short-circuits; only a
   `failed` job is removed and retried.
2. Redis `INCR` on `enrich:cap:<userId>:<UTC date>`, TTL 24 h. Over 50, the
   request is dropped with a warning — no error to the user.
3. `attempts: 3`, exponential backoff from 5 s, `removeOnComplete`,
   `removeOnFail` kept 24 h so failures stay visible in AdminJS.

The whole method is wrapped in try/catch: Redis or queue trouble must never
break the dictionary page.

## Processing

`EnrichmentProcessor` — a `WorkerHost` **inside the API process**, concurrency
2, limiter 5 jobs/second.

1. Status → `ENRICHING`.
2. Seed from local data: Wiktextract glosses are already English, so the first
   three joined with `; ` become a provisional translation.
3. **Gemini** (`gemini-flash-lite-latest`, or `gemini-2.5-flash` when
   `betterModel`), temperature 0.4, `responseMimeType: application/json` with a
   strict `responseSchema`: translation, emoji, `cefrLevel` enumerated over the
   12 half sub-levels, one-sentence `usageNote`, 2–4 examples, 0–4 collocations,
   0–2 false friends, `register` from a 9-value enum, mnemonic. Returns `null`
   only when `GEMINI_API_KEY` is unset; a real API error **throws** so the job
   retries.
4. **Unsplash** image, searched by translation (falling back to the headword),
   `orientation=squarish` for the entry's square thumbnail. `UnsplashProvider`
   lives in `apps/api/src/images/` and is shared with micro-stories
   (`stories.md`) through `ImagesModule`, which ask for `landscape` instead.
5. **Audio**: ElevenLabs first (voice and model from `ELEVENLABS_VOICE_ID` /
   `ELEVENLABS_MODEL_ID`), falling back to Google Cloud TTS (`de-DE`, neutral)
   on any error or when unconfigured. One mp3 for the headword keyed by entry id,
   plus one per example keyed `<entryId>-ex<n>`, written to
   `static/audio/` and served at `/api/static/audio/<key>.mp3`.
   `TtsProvider` lives in `apps/api/src/tts/` and is shared with micro-stories
   (`stories.md`) via `TtsModule`; its ElevenLabs request timeout scales with
   text length, so a headword and a whole story both get a workable budget.
6. One transaction: delete old examples, write everything, insert new examples,
   upsert the image credit, status → `ENRICHED`.

Steps 4 and 5 run through a `safe()` wrapper that logs and swallows — image and
audio are polish and must never block `ENRICHED`. Only Gemini can fail a job.

## What Unsplash is owed

Their API guidelines ask for two things back, and both are handled once, in
shared code, so the dictionary and story paths cannot drift apart:

- Selecting a photo pings its `download_location`, which is how an application
  reports that it is using the photo and credits the photographer with it. The
  ping is swallowed on failure — it is bookkeeping owed to Unsplash, and losing
  it must not lose the learner the image already in hand.
- Every attribution link carries `utm_source=vocabahn&utm_medium=referral`.
  `UnsplashCredit` (`apps/web/src/components/UnsplashCredit.tsx`) renders
  "Photo by X on Unsplash" for both the entry image and the story banner, and
  appends the parameters at render time — so entries whose credit was stored
  before this existed are compliant too.

`@OnWorkerEvent('failed')` writes status `FAILED` and a truncated
`enrichmentError` **only after all retries are exhausted**, so transient
failures never surface as `FAILED`.

## How the client learns it finished

Polling. `useQuery` with `refetchInterval` returning 4000 while
`enrichmentStatus` is `PENDING` or `ENRICHING`, and `false` otherwise
(`DictionaryCard.tsx:65`, `ReviewSession.tsx:235`). During a review, the card
shows an "Enriching in background…" spinner. There is no SSE and no WebSocket
anywhere in the codebase.

## Feedback-driven re-enrichment

`EntryFeedback` is one row per (entry, user): an optional up/down `vote`, a set
of `FeedbackIssue` checkboxes, a free-text comment, plus `userAgent`, `locale`,
and `path` captured for triage. The headword is denormalized onto the row so
AdminJS can browse by word.

A `DOWN` vote **plus** at least one of `TRANSLATION`, `EXAMPLE`, `IMAGE`, or
`OTHER` triggers `requestReenrichment`: `betterModel: true`, `attempts: 2`,
**quota bypassed**, `jobId` prefixed `reenrich:`.

## Limitations

- Generated audio is persisted in production via a named volume (`audio-data` mounted at `static/audio/` in `docker-compose.prod.yml`, resolved from #14).
- Quota is consumed on **enqueue**, before any external call. A job that fails
  all three attempts still cost the user one of their 50.
- Viewing pre-learner-aid entries burns quota invisibly (the `register === null`
  backfill).
- (#28) `LEVEL`, `GRAMMAR`, `EMOJI`, `AUDIO`, and `MNEMONIC` feedback issues trigger no
  re-enrichment at all. Conversely `IMAGE` triggers a full Gemini re-run even
  though images come from Unsplash.
- Nothing throttles re-enrichment per entry or per user: each qualifying `DOWN`
  vote from a different user queues another `betterModel` run.
- `requestReenrichment` does not itself touch `enrichmentStatus`, despite its
  docstring; the entry stays `ENRICHED` until the worker picks the job up and
  sets `ENRICHING`. Under queue backlog the user sees no acknowledgement that
  their report did anything.
- `apps/api/scripts/reset-stuck-enrichments.ts` exists because entries can strand
  in `ENRICHING` — for instance if the process dies mid-job. There is no
  automatic recovery.
