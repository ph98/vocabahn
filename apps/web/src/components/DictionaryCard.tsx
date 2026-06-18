import { useGSAP } from '@gsap/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FEEDBACK_ISSUE_LABELS,
  type AdjectiveDeclension,
  type AdjectiveDeclensionTable,
  type ConjugationMood,
  type DictionaryEntryDetail,
  type FeedbackIssue,
  type FeedbackVote,
  type NounDeclension,
  type PersonForms,
  type SubmitFeedbackBody,
  type VerbConjugation,
} from '@vocabahn/shared';
import gsap from 'gsap';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addWordToDeck, fetchDecks, fetchDictionaryEntry, fetchFeedback, markWordKnown, searchDictionary, submitFeedback } from '../api';
import { prefersReducedMotion } from '../lib/motion';
import { Tab, TabList, TabPanel } from './Tabs';

const FEEDBACK_ISSUES = Object.keys(FEEDBACK_ISSUE_LABELS) as FeedbackIssue[];

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

function getArticleColor(article: string) {
  if (article.includes('der')) return 'text-sky-400';
  if (article.includes('die')) return 'text-rose-400';
  if (article.includes('das')) return 'text-emerald-400';
  return 'text-surface-400';
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
        className="mb-4 min-h-11 rounded-xl border border-surface-700 px-4 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to results
      </button>
      {isPending && (
        <div className="animate-pulse" aria-hidden="true">
          <div className="mb-3 h-4 w-24 rounded skeleton-shimmer" />
          <header className="mb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="h-8 w-48 rounded skeleton-shimmer" />
              <div className="size-11 rounded-full skeleton-shimmer" />
            </div>
            <div className="mt-2 flex gap-3">
              <div className="h-4 w-12 rounded skeleton-shimmer" />
              <div className="h-4 w-16 rounded skeleton-shimmer" />
              <div className="h-4 w-20 rounded skeleton-shimmer" />
            </div>
            <div className="mt-3 flex gap-2">
              <div className="h-11 w-32 rounded-xl skeleton-shimmer" />
              <div className="h-11 w-40 rounded-xl skeleton-shimmer" />
            </div>
          </header>
          <div className="mb-3 h-48 w-full rounded-xl skeleton-shimmer" />
          <div className="mb-3 h-6 w-3/4 rounded skeleton-shimmer" />
          <div className="flex gap-1 border-b border-surface-800">
            <div className="h-11 w-24 rounded-t-lg skeleton-shimmer" />
            <div className="h-11 w-24 rounded-t-lg skeleton-shimmer" />
          </div>
        </div>
      )}
      {isError && (
        <p aria-live="polite" className="text-accent-red">
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
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-surface-700 text-sm transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
          <tr key={p} className="border-b border-surface-900">
            <td className="w-24 py-1 pr-3 text-surface-500">{PERSON_LABELS[p]}</td>
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
    return <p className="text-sm text-surface-500">No forms available.</p>;
  }
  return (
    <div className="space-y-4">
      {tenses.map((tense) => (
        <div key={tense}>
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
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
  const baseId = useId();

  if (!active) return null;

  const panelId = `${baseId}-panel`;

  return (
    <section className="mb-4">
      <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-surface-400">
        Conjugation
      </h4>
      {(conjugation.auxiliary || conjugation.participlePast) && (
        <p className="mb-2 text-sm text-surface-400">
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
      <TabList label="Conjugation mood" className="mb-3 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <Tab
            key={tab}
            id={`${baseId}-tab-${tab}`}
            controls={panelId}
            selected={active === tab}
            onSelect={() => setActive(tab)}
            className={`min-h-11 shrink-0 rounded-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              active === tab ? 'bg-indigo-500/20 text-accent-indigo' : 'text-surface-400 hover:bg-surface-800'
            }`}
          >
            {MOOD_LABELS[tab]}
          </Tab>
        ))}
      </TabList>
      <TabPanel id={panelId} labelledBy={`${baseId}-tab-${active}`}>
        {active === 'imperative' ? (
          <PersonFormsTable forms={conjugation.imperative} />
        ) : (
          <MoodPanel mood={conjugation[active]} />
        )}
      </TabPanel>
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
      <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-surface-400">Declension</h4>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-surface-500">
            <th className="py-1 pr-3 font-normal" />
            <th className="py-1 pr-3 font-normal">Singular</th>
            <th className="py-1 font-normal">Plural</th>
          </tr>
        </thead>
        <tbody>
          {CASE_ORDER.map((c) => (
            <tr key={c} className="border-b border-surface-900">
              <td className="py-1 pr-3 text-surface-500">{CASE_LABELS[c]}</td>
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
    return <p className="text-sm text-surface-500">No forms available.</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-surface-500">
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
            <tr key={c} className="border-b border-surface-900">
              <td className="py-1 pr-3 text-surface-500">{CASE_LABELS[c]}</td>
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
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const activeTabId = strength ? `${baseId}-strength-tab-${strength}` : `${baseId}-degree-tab-${activeDegree}`;

  return (
    <section className="mb-4">
      <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-surface-400">Declension</h4>

      {degrees.length > 1 && (
        <TabList label="Degree" className="mb-2 flex gap-1 overflow-x-auto">
          {degrees.map((d) => (
            <Tab
              key={d}
              id={`${baseId}-degree-tab-${d}`}
              controls={panelId}
              selected={activeDegree === d}
              onSelect={() => setActiveDegree(d)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                activeDegree === d ? 'bg-indigo-500/20 text-accent-indigo' : 'text-surface-400 hover:bg-surface-800'
              }`}
            >
              {DEGREE_LABELS[d]}
            </Tab>
          ))}
        </TabList>
      )}

      {degree.predicative && (
        <p className="mb-2 text-sm text-surface-400">
          Predicative: <span lang="de">{degree.predicative}</span>
        </p>
      )}

      {strengths.length > 0 && (
        <TabList label="Declension type" className="mb-3 flex gap-1 overflow-x-auto">
          {strengths.map((s) => (
            <Tab
              key={s}
              id={`${baseId}-strength-tab-${s}`}
              controls={panelId}
              selected={strength === s}
              onSelect={() => setActiveStrength(s)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                strength === s ? 'bg-indigo-500/20 text-accent-indigo' : 'text-surface-400 hover:bg-surface-800'
              }`}
            >
              {STRENGTH_LABELS[s]}
            </Tab>
          ))}
        </TabList>
      )}

      <TabPanel id={panelId} labelledBy={activeTabId}>
        {strength && <AdjectiveCaseTable table={degree[strength]} />}
      </TabPanel>
    </section>
  );
}

/** Collocations/idioms, false friends, register, and a memory hook. */
function LearnerAidsSection({ entry }: { entry: DictionaryEntryDetail }) {
  return (
    <div className="space-y-4">
      {entry.register && entry.register !== 'neutral' && (
        <p className="text-sm">
          <span className="text-surface-500">Register: </span>
          <span className="rounded bg-surface-800 px-1.5 capitalize text-surface-300">
            {entry.register}
          </span>
        </p>
      )}

      {entry.mnemonic && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
            Memory hook
          </h4>
          <p className="text-sm text-surface-200">{entry.mnemonic}</p>
        </section>
      )}

      {entry.collocations.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
            Collocations &amp; idioms
          </h4>
          <ul className="space-y-1.5 text-sm">
            {entry.collocations.map((c) => (
              <li key={c.phrase}>
                <span lang="de">{c.phrase}</span>
                <span className="text-surface-400"> — {c.translation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.falseFriends.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
            False friends
          </h4>
          <ul className="space-y-1.5 text-sm">
            {entry.falseFriends.map((f) => (
              <li key={f.word}>
                <span lang="en" className="font-medium">
                  {f.word}
                </span>
                <span className="text-surface-400"> — {f.explanation}</span>
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
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500">
            Word family
          </h4>
          <ul className="flex flex-wrap gap-1.5">
            {entry.wordFamily.map((f) => (
              <li key={f.word}>
                <button
                  type="button"
                  lang="de"
                  onClick={() => onSelectWord(f.word)}
                  className="min-h-11 rounded-full border border-surface-700 px-2.5 text-sm transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500">
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
                {p.note && <span className="text-surface-500">{p.note}</span>}
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
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
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
          <span className="text-surface-500">Synonyms: </span>
          <span lang="de">{synonyms.join(', ')}</span>
        </p>
      )}

      {entry.etymology && (
        <div className="mt-3">
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
            Etymology
          </h5>
          <p className="text-surface-300">{entry.etymology}</p>
        </div>
      )}

      {entry.forms.length > 0 && (
        <div className="mt-3">
          <h5 className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">
            Forms
          </h5>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left">
              <tbody>
                {entry.forms.map((f, i) => (
                  <tr key={`${f.form}-${i}`} className="border-b border-surface-900">
                    <td lang="de" className="py-1 pr-3 align-top">
                      {f.form}
                    </td>
                    <td className="py-1 text-surface-500">{f.tags.join(', ')}</td>
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

/** "Was this helpful?" vote + optional issue checkboxes and comment, upserted per user/entry. */
/** Fades and slides in the "Thanks for the feedback!" confirmation when `show` becomes true. */
function FeedbackConfirmation({ show }: { show: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      if (!show || !ref.current || prefersReducedMotion()) return;
      gsap.from(ref.current, { opacity: 0, y: 6, duration: 0.25, ease: 'power2.out' });
    },
    { dependencies: [show], scope: ref },
  );

  return (
    <p ref={ref} aria-live="polite" className="text-xs text-accent-emerald">
      {show ? 'Thanks for the feedback!' : ' '}
    </p>
  );
}

function FeedbackWidget({ word }: { word: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['entry-feedback', word],
    queryFn: () => fetchFeedback(word),
  });

  const [vote, setVote] = useState<FeedbackVote | null>(null);
  const [issues, setIssues] = useState<Set<FeedbackIssue>>(new Set());
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setVote(data.vote);
    setIssues(new Set(data.issues));
    setComment(data.comment ?? '');
    setExpanded(data.issues.length > 0 || Boolean(data.comment));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (body: SubmitFeedbackBody) => submitFeedback(word, body),
    onSuccess: (result) => queryClient.setQueryData(['entry-feedback', word], result),
  });

  const send = (overrides: Partial<SubmitFeedbackBody>) => {
    mutation.mutate({ vote, issues: [...issues], comment: comment || undefined, ...overrides });
  };

  const toggleVote = (v: FeedbackVote) => {
    const next = vote === v ? null : v;
    setVote(next);
    send({ vote: next });
  };

  const toggleIssue = (issue: FeedbackIssue) => {
    const next = new Set(issues);
    if (next.has(issue)) {
      next.delete(issue);
    } else {
      next.add(issue);
    }
    setIssues(next);
    send({ issues: [...next] });
  };

  return (
    <section className="mt-6 border-t border-surface-800 pt-4">
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500">
        Is this entry helpful?
      </h4>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={vote === 'UP'}
          onClick={() => toggleVote('UP')}
          aria-label="This entry is helpful"
          className={`min-h-11 min-w-11 rounded-xl border px-3 text-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            vote === 'UP'
              ? 'border-emerald-400/60 bg-emerald-400/10'
              : 'border-surface-700 hover:bg-surface-800'
          }`}
        >
          👍
        </button>
        <button
          type="button"
          aria-pressed={vote === 'DOWN'}
          onClick={() => toggleVote('DOWN')}
          aria-label="This entry has a problem"
          className={`min-h-11 min-w-11 rounded-xl border px-3 text-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            vote === 'DOWN'
              ? 'border-red-400/60 bg-red-400/10'
              : 'border-surface-700 hover:bg-surface-800'
          }`}
        >
          👎
        </button>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="min-h-11 rounded-xl px-2 text-sm text-surface-400 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {expanded ? 'Hide details' : 'Report a problem'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="mb-1.5 text-xs text-surface-500">What's wrong? (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_ISSUES.map((issue) => (
                <label
                  key={issue}
                  className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
                    issues.has(issue)
                      ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-200'
                      : 'border-surface-700 text-surface-300 hover:bg-surface-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={issues.has(issue)}
                    onChange={() => toggleIssue(issue)}
                    className="size-4 rounded border-surface-600 bg-surface-900 text-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  />
                  {FEEDBACK_ISSUE_LABELS[issue]}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={`feedback-comment-${word}`} className="mb-1 block text-xs text-surface-500">
              Additional details (optional)
            </label>
            <textarea
              id={`feedback-comment-${word}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={() => send({ comment: comment || undefined })}
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-surface-700 bg-surface-950 px-3 py-2 text-sm placeholder:text-surface-500 transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              placeholder="What did you notice?"
            />
          </div>

          <FeedbackConfirmation show={mutation.isSuccess && !mutation.isPending} />
        </div>
      )}
    </section>
  );
}

export function EntryBody({
  entry,
  onSelectWord,
}: {
  entry: DictionaryEntryDetail;
  onSelectWord: (word: string) => void;
}) {
  const queryClient = useQueryClient();
  const markKnownMutation = useMutation({
    mutationFn: () => markWordKnown(entry.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['known-words'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const { data: deckData } = useQuery({ queryKey: ['decks'], queryFn: fetchDecks });
  const myDecks = deckData?.myDecks ?? [];
  const [addedToDeck, setAddedToDeck] = useState<string | null>(null);
  const addToDeckMutation = useMutation({
    mutationFn: (deckId: string) => addWordToDeck(deckId, entry.id),
    onSuccess: (_data, deckId) => {
      void queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
      setAddedToDeck(deckId);
      setTimeout(() => setAddedToDeck(null), 2000);
    },
  });

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
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  return (
    <article aria-live="polite">
      {entry.formOf && (
        <p className="mb-3 rounded-lg bg-surface-800 px-3 py-2 text-sm text-surface-300">
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
          <h3 className="text-2xl font-bold font-serif">
            {article && <span className={`font-normal font-sans ${getArticleColor(article)}`}>{article} </span>}
            <span lang="de">{entry.word}</span>
            {entry.emoji && <span aria-hidden="true" className="font-sans"> {entry.emoji}</span>}
          </h3>
          {entry.audioUrl && (
            <AudioButton src={entry.audioUrl} label={`Pronounce ${entry.word}`} />
          )}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-surface-400">
          <span>{entry.pos}</span>
          {entry.ipa && <span>{entry.ipa}</span>}
          {entry.hyphenation && <span lang="de">{entry.hyphenation}</span>}
          {entry.cefrLevel && (
            <span className="rounded bg-surface-800 px-1.5 text-surface-300">{entry.cefrLevel}</span>
          )}
          {entry.frequencyRank && <span>#{entry.frequencyRank} by frequency</span>}
        </p>
        {entry.topics.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {entry.topics.map((topic) => (
              <span key={topic} className="rounded-full bg-surface-800 px-2 py-0.5 text-xs text-surface-300">
                {topic}
              </span>
            ))}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => markKnownMutation.mutate()}
            disabled={markKnownMutation.isPending || markKnownMutation.isSuccess}
            className={`min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 ${
              markKnownMutation.isSuccess
                ? 'border-emerald-400/60 bg-emerald-400/10 text-accent-emerald'
                : 'border-surface-700 hover:border-surface-600 hover:bg-surface-800'
            }`}
          >
            {markKnownMutation.isSuccess ? 'Known ✓' : markKnownMutation.isPending ? 'Marking…' : 'Mark as known'}
          </button>
          {myDecks.length > 0 && (
            <div className="relative">
              <label className="sr-only" htmlFor={`add-to-deck-${entry.id}`}>
                Add to deck
              </label>
              <select
                id={`add-to-deck-${entry.id}`}
                value=""
                onChange={(e) => { if (e.target.value) addToDeckMutation.mutate(e.target.value); }}
                disabled={addToDeckMutation.isPending}
                className="min-h-11 rounded-xl border border-surface-700 bg-surface-900 px-3 pr-8 text-sm transition-colors hover:border-surface-600 focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 appearance-none cursor-pointer"
              >
                <option value="" disabled>
                  {addedToDeck ? 'Added ✓' : addToDeckMutation.isPending ? 'Adding…' : '+ Add to deck'}
                </option>
                {myDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {(entry.enrichmentStatus === 'PENDING' || entry.enrichmentStatus === 'ENRICHING') && (
        <p
          role="status"
          className="mb-3 flex items-center gap-2 rounded-lg bg-amber-950/60 px-3 py-2 text-sm text-accent-amber"
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none rounded-full border-2 border-amber-300/30 border-t-amber-300"
          />
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
            <figcaption className="mt-1 text-xs text-surface-500">
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
        <TabList label="Entry sections" className="mb-3 flex gap-1 overflow-x-auto border-b border-surface-800">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              controls={panelId}
              selected={activeTab === tab.id}
              onSelect={() => setActive(tab.id)}
              className={`min-h-11 shrink-0 rounded-t-lg px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                activeTab === tab.id
                  ? 'border-b-2 border-indigo-400 text-white'
                  : 'text-surface-400 hover:bg-surface-800'
              }`}
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
      )}

      <TabPanel id={panelId} labelledBy={`${baseId}-tab-${activeTab}`}>
        {activeTab === 'overview' && (
          <>
            {entry.usageNote && (
              <section className="mb-4 rounded-2xl border border-surface-800/60 bg-surface-950/80 p-4">
                <h4 className="mb-0.5 text-xs font-medium uppercase tracking-wide text-surface-500">
                  How to use
                </h4>
                <p className="text-sm text-surface-200">{entry.usageNote}</p>
              </section>
            )}

            {entry.examples.length > 0 && (
              <section className="mb-4 rounded-2xl border border-surface-800/60 bg-surface-950/80 p-4">
                <h4 className="mb-2 text-sm font-medium uppercase tracking-wide text-surface-400">
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
                        <span className="block text-sm text-surface-400">{ex.en}</span>
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
      </TabPanel>

      <FeedbackWidget word={entry.word} />
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
      className="w-full rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-lg shadow-black/20"
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
    <>
      <section
        aria-label="Dictionary"
        className="w-full rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-lg shadow-black/20 transition-all"
      >
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-surface-400">
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
          className="min-h-14 w-full rounded-2xl border border-surface-700 bg-surface-950 px-6 text-lg placeholder:text-surface-500 transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        />
      <div aria-live="polite" className="mt-3">
        {isFetching && <p className="text-sm text-surface-400">Searching…</p>}
        {results && results.length === 0 && (
          <p className="text-sm text-surface-400">No matches for “{debounced}”.</p>
        )}
        {results && results.length > 0 && (
          <ul className="divide-y divide-surface-800">
            {results.map((r) => (
              <li key={`${r.word}-${r.pos}`}>
                <button
                  type="button"
                  onClick={() => navigate(`/word/${encodeURIComponent(r.word)}`)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-1 py-2 text-left transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className="min-w-0">
                    <span lang="de" className="font-medium">
                      {articleFor(r.gender) ? <span className={getArticleColor(articleFor(r.gender)!)}>{`${articleFor(r.gender)} `}</span> : ''}
                      {r.word}
                    </span>
                    {r.translation && (
                      <span className="ml-2 truncate text-sm text-surface-400">
                        {r.translation}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-surface-500">{r.pos}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
    </>
  );
}
