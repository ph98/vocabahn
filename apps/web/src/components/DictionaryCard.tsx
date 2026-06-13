import { useQuery } from '@tanstack/react-query';
import type { DictionaryEntryDetail } from '@vocabahn/shared';
import { useEffect, useRef, useState } from 'react';
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

function EntryDetail({ word, onBack }: { word: string; onBack: () => void }) {
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
        className="mb-4 min-h-11 rounded-xl border border-neutral-700 px-4 text-sm transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to results
      </button>
      {isPending && <p aria-live="polite">Loading entry…</p>}
      {isError && (
        <p aria-live="polite" className="text-red-400">
          Couldn't load “{word}”.
        </p>
      )}
      {entry && <EntryBody entry={entry} />}
    </div>
  );
}

/** Compact, keyboard-accessible "play audio" button backed by a hidden <audio>. */
function AudioButton({ src, label }: { src: string; label: string }) {
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

function EntryBody({ entry }: { entry: DictionaryEntryDetail }) {
  const article = articleFor(entry.gender);
  const glosses = [...new Set(entry.senses.flatMap((s) => s.glosses))];
  const synonyms = [...new Set(entry.senses.flatMap((s) => s.synonyms))];
  const hasDetails =
    glosses.length > 0 || synonyms.length > 0 || Boolean(entry.etymology) || entry.forms.length > 0;

  return (
    <article aria-live="polite">
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

      {hasDetails && (
        <details className="mt-2 border-t border-neutral-800 pt-2 text-sm">
          <summary className="cursor-pointer text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            Dictionary details
          </summary>

          {glosses.length > 0 && (
            <div className="mt-3">
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
        </details>
      )}
    </article>
  );
}

export function DictionaryCard() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const debounced = useDebounced(query.trim(), 250);

  const { data: results, isFetching } = useQuery({
    queryKey: ['dictionary-search', debounced],
    queryFn: () => searchDictionary(debounced),
    enabled: debounced.length >= 2 && !selected,
  });

  return (
    <section
      aria-label="Dictionary"
      className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
    >
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-400">
        Dictionary
      </h2>

      {selected ? (
        <EntryDetail word={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <label htmlFor="dict-search" className="sr-only">
            Search German words
          </label>
          <input
            id="dict-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search German words…"
            autoComplete="off"
            lang="de"
            className="min-h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 text-base placeholder:text-neutral-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                      onClick={() => setSelected(r.word)}
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
        </>
      )}
    </section>
  );
}
