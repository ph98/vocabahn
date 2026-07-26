# Dictionary

Two layers of German lexical data, how a headword resolves to an entry, and the
morphology tables built on top.

Code: `apps/api/src/dictionary/`, `apps/web/src/components/DictionaryCard.tsx`
(1135 lines — the largest component in the repo).

## Two layers

**Lexicon** — the complete Wiktextract ingest, never shown directly:
`LexiconEntry` (headword, POS, gender, IPA, hyphenation, etymology,
`frequencyRank`, plus `raw` holding the entire original record as an escape
hatch), with `WordSense` and `WordForm` children.

**Active dictionary** — `DictionaryEntry`, one per promoted lexicon entry, 1:1
via a unique `lexiconEntryId`. Holds only learner-facing, LLM-generated content:
translation, emoji, `cefrLevel`, `usageNote`, `collocations`, `falseFriends`,
`register`, `mnemonic`, image, audio, enrichment status. Cards, course words,
deck words, and feedback all reference `DictionaryEntry`, never `LexiconEntry`.

`frequencyRank` is the **minimum** rank across the headword and all its inflected
forms, from `de_full.txt`.

## Resolving a headword

`DictionaryService.getEntry(word, userId)` — the most intricate function in the
API. Recursion is bounded by `depth < 2`.

1. **Exact-case match first**, case-insensitive second. German case carries
   meaning (`Frau` the noun vs `frau`), so an exact hit must never lose to a
   same-spelling variant.
2. **No active entry → promote.** Candidate lexicon entries for that spelling
   are filtered to real lemmas — at least one sense lacking a `form-of` /
   `alt-of` tag — then sorted by `POS_PRIORITY` (`noun`, `verb`, `adj`, `adv`,
   then everything else), tie-broken by sense count. The winner becomes a
   `PENDING` `DictionaryEntry` and is pushed into the search index.
3. **Only inflected forms exist → show the lemma.** The lemma's entry is
   returned with `formOf: { lemma, descriptions }` so the UI can render a
   "plural of Hund" banner. Wiktextract's `inflection of X:` boilerplate is
   stripped from the descriptions.
4. **Case-variant merge.** If a sibling lexicon entry with the same spelling is
   an `alt-of` pointer to a differently-cased word, the other word's entry
   becomes primary and this entry's senses are appended. This is what keeps the
   common meaning of `Du`/`du` from being shadowed by the rare noun `das Du`.
5. **Enrichment trigger** — see `enrichment.md`.

## Search

Fuse.js, in-process. Weighted `word` (2) over `translation` (1), threshold 0.3,
`ignoreLocation`, capped at 20 results.

The index is built in `onModuleInit` over every `DictionaryEntry`. When a word
is promoted, it is added to the index, and when enrichment completes (or fails),
`DictionaryService.updateSearchIndex(id)` updates the entry in Fuse.js so new
translations become searchable immediately.

Note regarding multi-replica deployments:
- With more than one API replica, each holds its own in-memory index, so search
  index updates affect only the replica processing the enrichment job unless
  search is moved to a shared index or Postgres full-text search.

Client side: query lives in the URL as `?q=`, debounced 250 ms, fired at ≥ 2
characters (`DictionaryCard.tsx:1057`).

## Entry rendering

`EntryBody` is shared between the dictionary page and the back of a review card,
so both always show identical content. Tabs are built conditionally — a tab
appears only if it has content:

| Tab | Shown when |
| :--- | :--- |
| Overview | always |
| Morphology | a verb conjugation, noun declension, or adjective declension table could be built |
| Family | word family entries exist, or more than one pronunciation |
| Tips | collocations, false friends, a mnemonic, or a non-`neutral` register |
| Details | etymology / hyphenation / raw sense data present |

Morphology tables are derived in `declension.ts` and `verb-conjugation.ts` from
`WordForm` rows, keyed off `lexiconEntry.pos`. `lexicon-extras.ts` pulls word
family, pronunciation variants, and topics out of the `raw` JSON.

Gender presentation: `m/f/n` → `der`/`die`/`das`, comma-joined when a word has
several (`der/die`). Colours are sky (`der`), rose (`die`), emerald (`das`) —
**observed**. A word with no gender renders a red `?`.

Loading uses a shimmer skeleton mirroring the real layout — headword block, POS
row, action buttons, image, tabs — not a progress bar (`DictionaryCard.tsx:81`).
Search results show a plain "Searching…" line instead.

## Limitations

- **Capitalized headwords resolve to the wrong sense, systematically** (#17).
  `POS_PRIORITY` ranks `noun` first, so any capitalized word with both a noun
  lexicon entry and a more common non-noun one promotes the noun.
  **Observed**: `Wenn` (frequency rank #35, a conjunction) renders as
  `das Wenn` tagged `NOUN`; `Hallo` (#164) is glossed only "hullabaloo", losing
  the greeting. Frequency rank is inherited from the spelling, so these entries
  advertise the importance of a sense they do not describe. The case-variant
  merge in step 4 handles `alt-of` siblings but not distinct-POS siblings.
- The wrong POS is passed to Gemini during enrichment, so the error propagates
  into generated content — though in the `Wenn` case the model's `usageNote`
  correctly described a conjunction anyway.
- Search is single-process in-memory: it does not survive horizontal scaling,
  and index build time grows with the whole active dictionary.
- `@Get(':word')` is declared after `quota`, `offline-pack`, and `search` in
  `dictionary.controller.ts`, so those three spellings can never be looked up as
  words. Harmless today; a trap when adding routes.
- C1/C2 coverage is incomplete — see `content.md` and issue #3.
