import { useQuery } from '@tanstack/react-query';
import type { DictionaryEntryDetail } from '@vocabahn/shared';
import { useEffect, useState } from 'react';
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
    refetchInterval: (q) =>
      q.state.data && q.state.data.enrichmentStatus === 'PENDING' ? 4000 : false,
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

function EntryBody({ entry }: { entry: DictionaryEntryDetail }) {
  const article = articleFor(entry.gender);
  const glosses = entry.senses.flatMap((s) => s.glosses).slice(0, 6);
  const synonyms = [...new Set(entry.senses.flatMap((s) => s.synonyms))].slice(0, 8);

  return (
    <article aria-live="polite">
      <header className="mb-3">
        <h3 className="text-2xl font-bold">
          {article && <span className="font-normal text-neutral-400">{article} </span>}
          <span lang="de">{entry.word}</span>
          {entry.emoji && <span aria-hidden="true"> {entry.emoji}</span>}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-neutral-400">
          <span>{entry.pos}</span>
          {entry.ipa && <span>{entry.ipa}</span>}
          {entry.hyphenation && <span lang="de">{entry.hyphenation}</span>}
          {entry.cefrLevel && <span>{entry.cefrLevel}</span>}
          {entry.frequencyRank && <span>#{entry.frequencyRank} by frequency</span>}
        </p>
      </header>

      {entry.enrichmentStatus === 'PENDING' && (
        <p className="mb-3 rounded-lg bg-amber-950/60 px-3 py-2 text-sm text-amber-300">
          Enriching this entry in the background…
        </p>
      )}

      {entry.translation && <p className="mb-3 text-lg">{entry.translation}</p>}

      {glosses.length > 0 && (
        <section className="mb-3">
          <h4 className="mb-1 text-sm font-medium uppercase tracking-wide text-neutral-400">
            Meanings
          </h4>
          <ol className="list-decimal space-y-1 pl-5">
            {glosses.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>
        </section>
      )}

      {entry.examples.length > 0 && (
        <section className="mb-3">
          <h4 className="mb-1 text-sm font-medium uppercase tracking-wide text-neutral-400">
            Examples
          </h4>
          <ul className="space-y-2">
            {entry.examples.map((ex) => (
              <li key={ex.de}>
                <p lang="de">{ex.de}</p>
                <p className="text-sm text-neutral-400">{ex.en}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {synonyms.length > 0 && (
        <p className="mb-3 text-sm">
          <span className="text-neutral-400">Synonyms: </span>
          <span lang="de">{synonyms.join(', ')}</span>
        </p>
      )}

      {entry.etymology && (
        <details className="mb-1 text-sm text-neutral-300">
          <summary className="cursor-pointer text-neutral-400">Etymology</summary>
          <p className="mt-1">{entry.etymology}</p>
        </details>
      )}

      {entry.forms.length > 0 && (
        <p className="text-sm text-neutral-500">{entry.forms.length} inflected forms ingested</p>
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
