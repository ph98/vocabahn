import { useQuery } from '@tanstack/react-query';
import type {
  AdjectiveDeclension,
  AdjectiveDeclensionTable,
  ConjugationMood,
  DictionaryEntryDetail,
  NounDeclension,
  PersonForms,
  VerbConjugation,
} from '@vocabahn/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchDictionaryEntry, searchDictionary } from '../api';

const ARTICLES: Record<string, string> = { m: 'der', f: 'die', n: 'das' };

function articleFor(gender: string | null): string | null {
  if (!gender) return null;
  return gender
    .split(',')
    .map((g) => ARTICLES[g])
    .filter(Boolean)
    .join('/');
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function EntryDetail({
  word,
  onBack,
  onSelectWord,
}: {
  word: string;
  onBack: () => void;
  onSelectWord: (word: string) => void;
}) {
  const { data: entry, isPending, isError } = useQuery({
    queryKey: ['dictionary-entry', word],
    queryFn: () => fetchDictionaryEntry(word),
    // Poll while the background pipeline enriches the entry (PRD §4.2)
    refetchInterval: (q) => {
      const status = q.state.data?.enrichmentStatus;
      return status === 'PENDING' || status === 'ENRICHING' ? 4000 : false;
    },
  });

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 min-h-11 rounded-xl border border-neutral-700 px-4 text-sm transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to results
      </button>
      {isPending && <p aria-live="polite">Loading entry…</p>}
      {isError && (
        <p aria-live="polite" className="text-red-400">
          Couldn't load “{word}”.
        </p>
      )}
      {entry && <EntryBody key={entry.word} entry={entry} onSelectWord={onSelectWord} />}
    </div>
  );
}

/** Compact, keyboard-accessible "play audio" button backed by a hidden <audio>. */
export function AudioButton({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  return (
    <span className="inline-flex items-center align-middle">
      <button
        type="button"
        onClick={() => void ref.current?.play()}
        aria-label={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 text-sm transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span aria-hidden="true">🔊</span>
      </button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- short German audio, transcript shown alongside */}
      <audio ref={ref} src={src} preload="none" />
    </span>
  );
}

const PERSON_LABELS: Record<keyof PersonForms, string> = {
  ich: 'ich',
  du: 'du',
  erSieEs: 'er/sie/es',
  wir: 'wir',
  ihr: 'ihr',
  sieSie: 'sie/Sie',
};

const PERSON_ORDER = Object.keys(PERSON_LABELS) as (keyof PersonForms)[];

const TENSE_LABELS: Record<keyof ConjugationMood, string> = {
  present: 'Präsens',
  preterite: 'Präteritum',
  perfect: 'Perfekt',
  pluperfect: 'Plusquamperfekt',
  futureI: 'Futur I',
  futureII: 'Futur II',
};

const MOOD_LABELS = {
  indicative: 'Indikativ',
  subjunctiveI: 'Konjunktiv I',
  subjunctiveII: 'Konjunktiv II',
  imperative: 'Imperativ',
} as const;

/** Person × form table shared by every mood/tense panel. */
function PersonFormsTable({ forms }: { forms: PersonForms }) {
  const rows = PERSON_ORDER.filter((p) => forms[p]);
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {rows.map((p) => (
          <tr key={p} className="border-b border-neutral-900">
            <td className="w-24 py-1 pr-3 text-neutral-500">{PERSON_LABELS[p]}</td>
            <td lang="de" className="py-1">
              {forms[p]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoodPanel({ mood }: { mood: ConjugationMood }) {
  const tenses = (Object.keys(TENSE_LABELS) as (keyof ConjugationMood)[]).filter((t) => mood[t]);
  if (tenses.length === 0) {
    return <p className="text-sm text-neutral-500">No forms available.</p>;
  }
  return (
    <div className="space-y-4">
      {tenses.map((tense) => (
        <div key={tense}>
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {TENSE_LABELS[tense]}
          </h5>
          <PersonFormsTable forms={mood[tense]!} />
        </div>
      ))}
    </div>
  );
}

/** Tabbed verb conjugation (Indikativ/Konjunktiv I/Konjunktiv II/Imperativ × tense × person). */
function ConjugationSection({ conjugation }: { conjugation: VerbConjugation }) {
  const moods = (['indicative', 'subjunctiveI', 'subjunctiveII'] as const).filter(
    (m) => Object.keys(conjugation[m]).length > 0,
  );
  const hasImperative = Object.keys(conjugation.imperative).length > 0;
  const tabs = hasImperative ? [...moods, 'imperative' as const] : moods;
  const [active, setActive] = useState<(typeof tabs)[number] | undefined>(tabs[0]);

  if (!active) return null;

  return (
    <section className="mb-4">
      <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">
        Conjugation
      </h4>
      {(conjugation.auxiliary || conjugation.participlePast) && (
        <p className="mb-2 text-sm text-neutral-400">
          {conjugation.auxiliary && (
            <>
              Aux: <span lang="de">{conjugation.auxiliary}</span>
              {conjugation.participlePast && ' · '}
            </>
          )}
          {conjugation.participlePast && (
            <>
              Partizip II: <span lang="de">{conjugation.participlePast}</span>
            </>
          )}
        </p>
      )}
      <div role="tablist" aria-label="Conjugation mood" className="mb-3 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => setActive(tab)}
            className={`min-h-11 shrink-0 rounded-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              active === tab ? 'bg-indigo-500/20 text-indigo-300' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            {MOOD_LABELS[tab]}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {active === 'imperative' ? (
          <PersonFormsTable forms={conjugation.imperative} />
        ) : (
          <MoodPanel mood={conjugation[active]} />
        )}
      </div>
    </section>
  );
}

const CASE_LABELS = {
  nominative: 'Nominative',
  genitive: 'Genitive',
  dative: 'Dative',
  accusative: 'Accusative',
} as const;

const CASE_ORDER = Object.keys(CASE_LABELS) as (keyof typeof CASE_LABELS)[];

/** 4-case × singular/plural table for a noun. */
function NounDeclensionSection({ declension }: { declension: NounDeclension }) {
  return (
    <section className="mb-4">
      <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">Declension</h4>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-neutral-500">
            <th className="py-1 pr-3 font-normal" />
            <th className="py-1 pr-3 font-normal">Singular</th>
            <th className="py-1 font-normal">Plural</th>
          </tr>
        </thead>
        <tbody>
          {CASE_ORDER.map((c) => (
            <tr key={c} className="border-b border-neutral-900">
              <td className="py-1 pr-3 text-neutral-500">{CASE_LABELS[c]}</td>
              <td lang="de" className="py-1 pr-3">
                {declension.singular[c] ?? '—'}
              </td>
              <td lang="de" className="py-1">
                {declension.plural[c] ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 4-case × masculine/feminine/neuter/plural table for one declension strength. */
function AdjectiveCaseTable({ table }: { table: AdjectiveDeclensionTable }) {
  const rows = CASE_ORDER.filter((c) => table[c]);
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No forms available.</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-neutral-500">
          <th className="py-1 pr-3 font-normal" />
          <th className="py-1 pr-2 font-normal">m</th>
          <th className="py-1 pr-2 font-normal">f</th>
          <th className="py-1 pr-2 font-normal">n</th>
          <th className="py-1 font-normal">pl</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const cell = table[c]!;
          return (
            <tr key={c} className="border-b border-neutral-900">
              <td className="py-1 pr-3 text-neutral-500">{CASE_LABELS[c]}</td>
              <td lang="de" className="py-1 pr-2">
                {cell.masculine ?? '—'}
              </td>
              <td lang="de" className="py-1 pr-2">
                {cell.feminine ?? '—'}
              </td>
              <td lang="de" className="py-1 pr-2">
                {cell.neuter ?? '—'}
              </td>
              <td lang="de" className="py-1">
                {cell.plural ?? '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const DEGREE_LABELS = { positive: 'Positive', comparative: 'Comparative', superlative: 'Superlative' } as const;
const STRENGTH_LABELS = {
  strong: 'Strong (no article)',
  weak: 'Weak (der/die/das)',
  mixed: 'Mixed (ein/eine)',
} as const;

/** Tabbed adjective declension: degree (positive/comparative/superlative) × strength × case. */
function AdjectiveDeclensionSection({ declension }: { declension: AdjectiveDeclension }) {
  const degrees = (['positive', 'comparative', 'superlative'] as const).filter((d) => declension[d]);
  const [activeDegree, setActiveDegree] = useState<'positive' | 'comparative' | 'superlative'>(
    () => degrees[0] ?? 'positive',
  );
  const degree = declension[activeDegree] ?? declension.positive;

  const strengths = (['strong', 'weak', 'mixed'] as const).filter(
    (s) => Object.keys(degree[s]).length > 0,
  );
  const [activeStrength, setActiveStrength] = useState<(typeof strengths)[number] | undefined>(strengths[0]);
  const strength = strengths.includes(activeStrength as never) ? activeStrength : strengths[0];

  return (
    <section className="mb-4">
      <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">Declension</h4>

      {degrees.length > 1 && (
        <div role="tablist" aria-label="Degree" className="mb-2 flex gap-1 overflow-x-auto">
          {degrees.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={activeDegree === d}
              onClick={() => setActiveDegree(d)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                activeDegree === d ? 'bg-indigo-500/20 text-indigo-300' : 'text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {DEGREE_LABELS[d]}
            </button>
          ))}
        </div>
      )}

      {degree.predicative && (
        <p className="mb-2 text-sm text-neutral-400">
          Predicative: <span lang="de">{degree.predicative}</span>
        </p>
      )}

      {strengths.length > 0 && (
        <div role="tablist" aria-label="Declension type" className="mb-3 flex gap-1 overflow-x-auto">
          {strengths.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={strength === s}
              onClick={() => setActiveStrength(s)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                strength === s ? 'bg-indigo-500/20 text-indigo-300' : 'text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {STRENGTH_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel">{strength && <AdjectiveCaseTable table={degree[strength]} />}</div>
    </section>
  );
}

/** Collocations/idioms, false friends, register, and a memory hook. */
function LearnerAidsSection({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <div className="space-y-4">
      {entry.register && entry.register !== 'neutral' && (
        <p className="text-sm">
          <span className="text-neutral-500">Register: </span>
          <span className="rounded bg-neutral-800 px-1.5 capitalize text-neutral-300">
            {entry.register}
          </span>
        </p>
      )}

      {entry.mnemonic && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Memory hook
          </h4>
          <p className="text-sm text-neutral-200">{entry.mnemonic}</p>
        </section>
      )}

      {entry.collocations.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Collocations &amp; idioms
          </h4>
          <ul className="space-y-1.5 text-sm">
            {entry.collocations.map((c) => (
              <li key={c.phrase}>
                <span lang="de">{c.phrase}</span>
                <span className="text-neutral-400"> — {c.translation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.falseFriends.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            False friends
          </h4>
          <ul className="space-y-1.5 text-sm">
            {entry.falseFriends.map((f) => (
              <li key={f.word}>
                <span lang="en" className="font-medium">
                  {f.word}
                </span>
                <span className="text-neutral-400"> — {f.explanation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Word family chips + pronunciation variants. */
function FamilySection({
  entry,
  onSelectWord,
}: {
  entry: DictionaryEntryDetail;
  onSelectWord: (word: string) => void;
}) {
  return (
    <div className="space-y-4">
      {entry.wordFamily.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Word family
          </h4>
          <ul className="flex flex-wrap gap-1.5">
            {entry.wordFamily.map((f) => (
              <li key={f.word}>
                <button
                  type="button"
                  lang="de"
                  onClick={() => onSelectWord(f.word)}
                  className="min-h-8 rounded-full border border-neutral-700 px-2.5 py-0.5 text-sm transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {f.word}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.pronunciation.length > 1 && (
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Pronunciation
          </h4>
          <ul className="space-y-1.5 text-sm">
            {entry.pronunciation.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                {p.audioUrl && (
                  <AudioButton
                    src={p.audioUrl}
                    label={`Pronounce ${entry.word}${p.note ? ` (${p.note})` : ''}`}
                  />
                )}
                {p.ipa && <span>{p.ipa}</span>}
                {p.note && <span className="text-neutral-500">{p.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Morphology: verb conjugation or noun/adjective declension tables. */
function MorphologySection({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <div>
      {entry.conjugation && <ConjugationSection conjugation={entry.conjugation} />}
      {entry.nounDeclension && <NounDeclensionSection declension={entry.nounDeclension} />}
      {entry.adjectiveDeclension && (
        <AdjectiveDeclensionSection declension={entry.adjectiveDeclension} />
      )}
    </div>
  );
}

/** Meanings, synonyms, etymology, and the raw forms table. */
function DetailsSection({
  glosses,
  synonyms,
  entry,
}: {
  glosses: string[];
  synonyms: string[];
  entry: DictionaryEntryDetail;
}) {
  return (
    <div className="text-sm">
      {glosses.length > 0 && (
        <div>
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Meanings
          </h5>
          <ol className="list-decimal space-y-1 pl-5">
            {glosses.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>
        </div>
      )}

      {synonyms.length > 0 && (
        <p className="mt-3">
          <span className="text-neutral-500">Synonyms: </span>
          <span lang="de">{synonyms.join(', ')}</span>
        </p>
      )}

      {entry.etymology && (
        <div className="mt-3">
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Etymology
          </h5>
          <p className="text-neutral-300">{entry.etymology}</p>
        </div>
      )}

      {entry.forms.length > 0 && (
        <div className="mt-3">
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Forms
          </h5>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left">
              <tbody>
                {entry.forms.map((f, i) => (
                  <tr key={`${f.form}-${i}`} className="border-b border-neutral-900">
                    <td lang="de" className="py-1 pr-3 align-top">
                      {f.form}
                    </td>
                    <td className="py-1 text-neutral-500">{f.tags.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryBody({
  entry,
  onSelectWord,
}: {
  entry: DictionaryEntryDetail;
  onSelectWord: (word: string) => void;
}) {
  const article = articleFor(entry.gender);
  const glosses = [...new Set(entry.senses.flatMap((s) => s.glosses))];
  const synonyms = [...new Set(entry.senses.flatMap((s) => s.synonyms))];
  const hasDetails =
    glosses.length > 0 || synonyms.length > 0 || Boolean(entry.etymology) || entry.forms.length > 0;
  const hasMorphology = Boolean(
    entry.conjugation || entry.nounDeclension || entry.adjectiveDeclension,
  );
  const hasFamily = entry.wordFamily.length > 0 || entry.pronunciation.length > 1;
  const hasAids =
    entry.collocations.length > 0 ||
    entry.falseFriends.length > 0 ||
    entry.mnemonic !== null ||
    (entry.register !== null && entry.register !== 'neutral');

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    ...(hasMorphology ? [{ id: 'morphology' as const, label: 'Morphology' }] : []),
    ...(hasFamily ? [{ id: 'family' as const, label: 'Family' }] : []),
    ...(hasAids ? [{ id: 'aids' as const, label: 'Tips' }] : []),
    ...(hasDetails ? [{ id: 'details' as const, label: 'Details' }] : []),
  ];
  const [active, setActive] = useState<(typeof tabs)[number]['id']>('overview');
  const activeTab = tabs.some((t) => t.id === active) ? active : 'overview';

  return (
    <article aria-live="polite">
      {entry.formOf && (
        <p className="mb-3 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300">
          {entry.formOf.descriptions.length > 0 ? entry.formOf.descriptions.join('; ') : 'Form of'}
          {' — '}
          <button
            type="button"
            lang="de"
            onClick={() => onSelectWord(entry.formOf!.lemma)}
            className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {entry.formOf.lemma}
          </button>
        </p>
      )}
      <header className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-2xl font-bold">
            {article && <span className="font-normal text-neutral-400">{article} </span>}
            <span lang="de">{entry.word}</span>
            {entry.emoji && <span aria-hidden="true"> {entry.emoji}</span>}
          </h3>
          {entry.audioUrl && (
            <AudioButton src={entry.audioUrl} label={`Pronounce ${entry.word}`} />
          )}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-neutral-400">
          <span>{entry.pos}</span>
          {entry.ipa && <span>{entry.ipa}</span>}
          {entry.hyphenation && <span lang="de">{entry.hyphenation}</span>}
          {entry.cefrLevel && (
            <span className="rounded bg-neutral-800 px-1.5 text-neutral-300">{entry.cefrLevel}</span>
          )}
          {entry.frequencyRank && <span>#{entry.frequencyRank} by frequency</span>}
        </p>
        {entry.topics.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {entry.topics.map((topic) => (
              <span key={topic} className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                {topic}
              </span>
            ))}
          </p>
        )}
      </header>

      {(entry.enrichmentStatus === 'PENDING' || entry.enrichmentStatus === 'ENRICHING') && (
        <p className="mb-3 rounded-lg bg-amber-950/60 px-3 py-2 text-sm text-amber-300">
          Enriching this entry in the background…
        </p>
      )}

      {entry.enrichmentStatus === 'FAILED' && (
        <p className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">
          Enrichment failed — showing dictionary data only.
        </p>
      )}

      {entry.imageUrl && (
        <figure className="mb-3">
          <img
            src={entry.imageUrl}
            alt={`Illustration for ${entry.word}`}
            loading="lazy"
            className="aspect-square w-full rounded-xl object-cover"
          />
          {entry.imageCredit && (
            <figcaption className="mt-1 text-xs text-neutral-500">
              Photo by{' '}
              {entry.imageCredit.authorUrl ? (
                <a
                  href={entry.imageCredit.authorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {entry.imageCredit.authorName}
                </a>
              ) : (
                entry.imageCredit.authorName
              )}{' '}
              on Unsplash
            </figcaption>
          )}
        </figure>
      )}

      {entry.translation && <p className="mb-3 text-lg">{entry.translation}</p>}

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Entry sections" className="mb-3 flex gap-1 overflow-x-auto border-b border-neutral-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActive(tab.id)}
              className={`min-h-11 shrink-0 rounded-t-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                activeTab === tab.id
                  ? 'border-b-2 border-indigo-400 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel">
        {activeTab === 'overview' && (
          <>
            {entry.usageNote && (
              <section className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                <h4 className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  How to use
                </h4>
                <p className="text-sm text-neutral-200">{entry.usageNote}</p>
              </section>
            )}

            {entry.examples.length > 0 && (
              <section className="mb-4">
                <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-400">
                  Examples
                </h4>
                <ul className="space-y-3">
                  {entry.examples.map((ex) => (
                    <li key={ex.de} className="flex items-start gap-2">
                      {ex.audioUrl && <AudioButton src={ex.audioUrl} label={`Play: ${ex.de}`} />}
                      <span className="min-w-0">
                        <span lang="de" className="block">
                          {ex.de}
                        </span>
                        <span className="block text-sm text-neutral-400">{ex.en}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {activeTab === 'morphology' && <MorphologySection entry={entry} />}
        {activeTab === 'family' && <FamilySection entry={entry} onSelectWord={onSelectWord} />}
        {activeTab === 'aids' && <LearnerAidsSection entry={entry} />}
        {activeTab === 'details' && (
          <DetailsSection glosses={glosses} synonyms={synonyms} entry={entry} />
        )}
      </div>
    </article>
  );
}

/** Entry detail page at /word/:word — shareable, deep-linkable. */
export function DictionaryEntryPage() {
  const { word } = useParams<{ word: string }>();
  const navigate = useNavigate();
  if (!word) return null;

  return (
    <section
      aria-label="Dictionary"
      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg shadow-black/20"
    >
      <EntryDetail
        word={decodeURIComponent(word)}
        onBack={() => navigate('/')}
        onSelectWord={(w) => navigate(`/word/${encodeURIComponent(w)}`)}
      />
    </section>
  );
}

export function DictionaryCard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const debounced = useDebounced(query.trim(), 250);

  const { data: results, isFetching } = useQuery({
    queryKey: ['dictionary-search', debounced],
    queryFn: () => searchDictionary(debounced),
    enabled: debounced.length >= 2,
  });

  return (
    <section
      aria-label="Dictionary"
      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg shadow-black/20"
    >
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-400">
        Dictionary
      </h2>

      <label htmlFor="dict-search" className="sr-only">
        Search German words
      </label>
      <input
        id="dict-search"
        type="search"
        value={query}
        onChange={(e) => {
          const value = e.target.value;
          setSearchParams(value ? { q: value } : {}, { replace: true });
        }}
        placeholder="Search German words…"
        autoComplete="off"
        lang="de"
        className="min-h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 text-base placeholder:text-neutral-500 transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      />
      <div aria-live="polite" className="mt-3">
        {isFetching && <p className="text-sm text-neutral-400">Searching…</p>}
        {results && results.length === 0 && (
          <p className="text-sm text-neutral-400">No matches for “{debounced}”.</p>
        )}
        {results && results.length > 0 && (
          <ul className="divide-y divide-neutral-800">
            {results.map((r) => (
              <li key={`${r.word}-${r.pos}`}>
                <button
                  type="button"
                  onClick={() => navigate(`/word/${encodeURIComponent(r.word)}`)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-1 py-2 text-left transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className="min-w-0">
                    <span lang="de" className="font-medium">
                      {articleFor(r.gender) ? `${articleFor(r.gender)} ` : ''}
                      {r.word}
                    </span>
                    {r.translation && (
                      <span className="ml-2 truncate text-sm text-neutral-400">
                        {r.translation}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">{r.pos}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
