import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaggerIn } from '../lib/motion';
import { bulkUndoKnownWords, fetchKnownWords, undoKnownWord } from '../api';
import { IllustrationTrophy } from './Illustrations';
import { PullToRefresh } from './PullToRefresh';
import { KnownWordsDiscover } from './KnownWordsDiscover';

export function KnownWordsPage() {
  const queryClient = useQueryClient();
  const { data: words, isPending, isError, refetch } = useQuery({ queryKey: ['known-words'], queryFn: fetchKnownWords });
  const listRef = useRef<HTMLUListElement>(null);
  useStaggerIn(listRef, 'li', [words]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['known-words'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const undoMutation = useMutation({ mutationFn: undoKnownWord, onSuccess: invalidate });
  const bulkUndoMutation = useMutation({
    mutationFn: bulkUndoKnownWords,
    onSuccess: () => {
      setSelected(new Set());
      setSelectMode(false);
      invalidate();
    },
  });

  const allIds = words?.map((w) => w.cardId) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allIds));

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  const [activeTab, setActiveTab] = useState<'known' | 'discover'>('discover');

  return (
    <section aria-label="Known words" className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl bg-surface-900 p-1">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            activeTab === 'discover' ? 'bg-surface-800 text-surface-50 shadow-sm' : 'text-surface-400 hover:text-surface-200'
          }`}
        >
          Discover
        </button>
        <button
          onClick={() => setActiveTab('known')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            activeTab === 'known' ? 'bg-surface-800 text-surface-50 shadow-sm' : 'text-surface-400 hover:text-surface-200'
          }`}
        >
          Your Words
        </button>
      </div>

      {activeTab === 'discover' ? (
        <KnownWordsDiscover />
      ) : (
        <>
          <PullToRefresh onRefresh={refetch} />

          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-surface-400">Known words</h2>
            {words && words.length > 0 && (
              <button
                type="button"
                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                className="min-h-11 rounded-xl border border-surface-700 px-3 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            )}
          </div>

      <p className="text-sm text-surface-400">
        Words the system has marked as known — they're scheduled far out instead of cluttering your reviews. Undo
        any of these to bring a word back into rotation.
      </p>

      {isPending && <p aria-live="polite">Loading known words…</p>}
      {isError && <p aria-live="polite" className="text-accent-red">Couldn't load known words.</p>}

      {words && words.length === 0 && (
        <div className="rounded-2xl border border-surface-800 bg-surface-900 p-6 text-center shadow-lg shadow-black/20">
          <IllustrationTrophy className="mx-auto mb-3 h-24 w-auto text-indigo-400 opacity-60" />
          <p>Nothing here yet — words you breeze through will show up as you review.</p>
          <Link
            to="/review"
            className="mt-4 inline-block min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Go to review
          </Link>
        </div>
      )}

      {words && words.length > 0 && (
        <>
          {selectMode && (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-surface-800 bg-surface-900 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all known words"
                  className="size-4 accent-indigo-500"
                />
                {selected.size === 0 ? 'Select all' : `${selected.size} selected`}
              </label>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => bulkUndoMutation.mutate([...selected])}
                  disabled={bulkUndoMutation.isPending}
                  className="min-h-11 rounded-xl border border-surface-700 px-3 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
                >
                  {bulkUndoMutation.isPending ? 'Undoing…' : `Undo ${selected.size}`}
                </button>
              )}
            </div>
          )}

          <ul ref={listRef} className="space-y-2">
            {words.map((w) => (
              <li
                key={w.cardId}
                className="flex items-center gap-3 rounded-2xl border border-surface-800 bg-surface-900 p-4 shadow-lg shadow-black/20"
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(w.cardId)}
                    onChange={() => toggle(w.cardId)}
                    aria-label={`Select ${w.word}`}
                    className="size-5 shrink-0 accent-indigo-500"
                  />
                )}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {w.emoji && <span className="shrink-0 text-2xl" aria-hidden="true">{w.emoji}</span>}
                  <div className="min-w-0">
                    <p className="truncate font-medium" lang="de">{w.word}</p>
                    <p className="truncate text-sm text-surface-400">{w.translation ?? '—'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full border border-surface-700 px-2 py-1 text-xs uppercase tracking-wide text-surface-400">
                    {w.reason === 'AUTO' ? 'Auto' : 'Marked by you'}
                  </span>
                  {!selectMode && (
                    <button
                      type="button"
                      onClick={() => undoMutation.mutate(w.cardId)}
                      disabled={undoMutation.isPending}
                      className="min-h-11 rounded-xl border border-surface-700 px-3 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
        </>
      )}
    </section>
  );
}
