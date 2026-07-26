# Content: Courses, Decks, and Source Data

Where study material comes from, and how it becomes cards.

Code: `apps/api/src/courses/`, `apps/api/src/decks/`, `apps/api/scripts/`,
`data/`, `apps/web/src/components/LibraryPage.tsx`, `CoursesPage.tsx`,
`DecksPage.tsx`.

## Source datasets

Not in git; mounted read-only into the API container in production (`./data`).

| File | Size | Role |
| :--- | :--- | :--- |
| `kaikki.org-dictionary-German-words.jsonl` | 938 MB | Wiktextract German dump → `LexiconEntry` / `WordSense` / `WordForm` |
| `de_full.txt` | 17 MB | corpus frequency list → `frequencyRank` |
| `german_cefr_wordlist.json` | 1.2 MB | word → CEFR sub-level, LLM-generated |
| `phase1_levels_gemini.tsv` | 175 KB | intermediate output of the first CEFR labelling pass |

Never read the 938 MB JSONL whole. Stream it or sample with `head`.

## Pipeline scripts

Run with `pnpm --filter @vocabahn/api <script>`; each loads the root `.env`.

- `ingest:lexicon` — streams the Wiktextract dump into the lexicon layer.
- `seed:dictionary` — promotes the top-N words by frequency into
  `DictionaryEntry` stubs, using the same lemma/POS heuristic as
  `DictionaryService` (`POS_PRIORITY`). Promotion only; no enrichment.
- `seed:cefr-courses` — builds the six official CEFR courses.
- `seed:course`, `seed:decks` — single course / sample decks.
- `stats` — snapshot of how data is flowing through the pipeline.
- `generate-c1-c2.ts` — Gemini batch labeller for CEFR levels.

## Courses

`Course` (slug, title, CEFR level, `order`, `published`) → ordered `CourseWord`
rows → `DictionaryEntry`. `UserCourse` records enrollment.

Six published courses, **observed** with these word counts:

| Course | Words |
| :--- | ---: |
| CEFR A1 — Beginner | 610 |
| CEFR A2 — Elementary | 821 |
| CEFR B1 — Intermediate | 2038 |
| CEFR B2 — Upper-Intermediate | 2589 |
| CEFR C1 — Advanced | 1624 |
| CEFR C2 — Mastery | **31** |

**Enrollment is required and explicit.** `POST /courses/:slug/enroll` upserts
`UserCourse` then `createMany`s one `Card` per course word with
`skipDuplicates`, so overlapping courses share cards rather than duplicating
them. Progress and per-word card state are computed only for enrolled courses;
an unenrolled course shows word count and nothing else.

Progress is three buckets over FSRS state: `learned` (`REVIEW`), `inProgress`
(any other existing card), `notStarted` (words with no card). **Observed** as the
two-segment green/amber bars on the dashboard and library.

## User decks

`UserDeck` (title, description, `isPublic`) → `UserDeckWord` → `DictionaryEntry`.
Full CRUD, ownership enforced by `assertOwner` on every mutation; a non-public
deck returns 403 to non-owners. `GET /decks` returns `myDecks` plus other users'
`publicDecks`. Bulk import takes a list of words and reports
`{ imported, failed }`. **Observed**: create modal with a "Make this deck public"
checkbox, and per-deck View words / Delete.

## Limitations

- **C1 and C2 vocabulary is incomplete (issue #3).** The cause is visible in
  `apps/api/scripts/generate-c1-c2.ts`: `START_INDEX = 14000`,
  `END_INDEX = 14500`, with a comment saying it processes 500 words "to
  demonstrate". C2 therefore has 31 words while its progress bar renders as
  though the course were nearly complete — the bar is a share of *seeded* words,
  not of the real level.
- **Deck words are not studyable.** Unlike enrollment, nothing in `DecksService`
  creates `Card` rows. A deck is a list; it cannot be reviewed. The Library UI
  presents decks and courses side by side, which implies otherwise.
- **Bulk import spends enrichment quota per word.** `importWords` calls
  `DictionaryService.getEntry` for each entry, which promotes stubs and triggers
  enrichment — so a 60-word import silently exhausts the 50/day cap and fires
  paid APIs. It is also sequential, one round trip per word.
- **No de-enrollment.** `UserCourse` rows can be created but never deleted; there
  is no endpoint and no UI. Cards created by an enrollment stay in the review
  queue permanently.
- Deleting a deck has no confirmation step (**observed**: a bare "Delete" button
  next to "View words").
- `Course.published` is respected by `listCourses` but not by `getCourse`, so an
  unpublished course is still readable by slug.
- `listCourses` loads every `CourseWord` id for all six courses (~7,700 rows) and
  then issues a per-course card query, and the dashboard calls it on every load.
- Community/official track distinctions, deck ratings, and deck cloning do not
  exist; `isPublic` is the only sharing mechanism.
