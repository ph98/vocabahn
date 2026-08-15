import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaggerIn } from '../lib/motion-gsap';
import { bulkUndoKnownWords, fetchKnownWords, undoKnownWord } from '../api';
import { IllustrationTrophy } from './Illustrations';
import { PullToRefresh } from './PullToRefresh';
import { KnownWordsDiscover } from './KnownWordsDiscover';
import { DiagnosticCalibrator } from './DiagnosticCalibrator';
import { CEFRBadge } from './CEFRBadge';
import { Search, Compass, Sparkles, BookOpen, Check } from 'lucide-react';

export function KnownWordsPage() {
  const queryClient = useQueryClient();
  const { data: words, isPending, isError, refetch } = useQuery({
    queryKey: ['known-words'],
    queryFn: fetchKnownWords,
  });
  const listRef = useRef<HTMLUListElement>(null);
  useStaggerIn(listRef, 'li', [words]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [knownSearch, setKnownSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'discover' | 'calibrate' | 'known'>('discover');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['known-words'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['known-words-suggestions'] });
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

  const filteredWords = useMemo(() => {
    if (!words) return [];
    if (!knownSearch.trim()) return words;
    const query = knownSearch.toLowerCase().trim();
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(query) ||
        (w.translation && w.translation.toLowerCase().includes(query)),
    );
  }, [words, knownSearch]);

  const allFilteredIds = filteredWords.map((w) => w.cardId);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));

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
    setSelected(allSelected ? new Set() : new Set(allFilteredIds));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  return (
    <section aria-label="Known words" className="space-y-4">
      {/* 3-Tab Navigation Bar */}
      <div className="flex items-center gap-1.5 rounded-2xl bg-surface-900 p-1 border border-surface-800">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'discover'
              ? 'bg-surface-800 text-surface-50 shadow-sm'
              : 'text-surface-400 hover:text-surface-200'
          }`}
        >
          <BookOpen className="size-3.5" />
          Discover & Search
        </button>

        <button
          onClick={() => setActiveTab('calibrate')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'calibrate'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-surface-400 hover:text-surface-200'
          }`}
        >
          <Compass className="size-3.5" />
          2-Min Diagnostic
        </button>

        <button
          onClick={() => setActiveTab('known')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'known'
              ? 'bg-surface-800 text-surface-50 shadow-sm'
              : 'text-surface-400 hover:text-surface-200'
          }`}
        >
          <Check className="size-3.5" />
          Your Words
          {words && words.length > 0 && (
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-mono ${
                activeTab === 'known'
                  ? 'bg-surface-700/80 text-surface-100'
                  : 'bg-surface-800 text-surface-400'
              }`}
            >
              {words.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Discover & Unlearned Words */}
      {activeTab === 'discover' && (
        <KnownWordsDiscover onLaunchDiagnostic={() => setActiveTab('calibrate')} />
      )}

      {/* Tab 2: 2-Minute Diagnostic Calibrator */}
      {activeTab === 'calibrate' && (
        <DiagnosticCalibrator
          onComplete={() => {
            void invalidate();
          }}
          onCancel={() => setActiveTab('discover')}
        />
      )}

      {/* Tab 3: Your Known Words List */}
      {activeTab === 'known' && (
        <>
          <PullToRefresh onRefresh={refetch} />

          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-surface-400">Known words</h2>
            {words && words.length > 0 && (
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className="min-h-11 rounded-xl border border-surface-700 px-3 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            )}
          </div>

          <p className="text-sm text-surface-400">
            Words marked as known are scheduled far out instead of cluttering your reviews. Undo any of these to bring a word back into active study rotation.
          </p>

          {words && words.length > 5 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-surface-400" />
              <input
                type="text"
                value={knownSearch}
                onChange={(e) => setKnownSearch(e.target.value)}
                placeholder="Search your known words…"
                className="w-full rounded-xl border border-surface-700 bg-surface-950 py-2 pl-9 pr-4 text-sm text-surface-100 placeholder-surface-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              {knownSearch && (
                <button
                  type="button"
                  onClick={() => setKnownSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400 hover:text-surface-200"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {isPending && <p aria-live="polite">Loading known words…</p>}
          {isError && <p aria-live="polite" className="text-accent-red">Couldn't load known words.</p>}

          {words && words.length === 0 && (
            <div className="rounded-2xl border border-surface-800 bg-surface-900 p-8 text-center shadow-lg shadow-black/20 space-y-4">
              <IllustrationTrophy className="mx-auto h-20 w-auto text-indigo-400 opacity-60" />
              <div className="space-y-1">
                <p className="font-semibold text-surface-100">No known words recorded yet</p>
                <p className="text-xs text-surface-400 max-w-sm mx-auto">
                  Take the 2-minute diagnostic calibration or review words in your study sessions to build your known vocabulary base.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('calibrate')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                >
                  <Sparkles className="size-3.5" />
                  Calibrate Level
                </button>
                <Link
                  to="/review"
                  className="inline-block rounded-xl border border-surface-700 px-4 py-2.5 text-xs font-semibold text-surface-200 hover:bg-surface-800"
                >
                  Go to review
                </Link>
              </div>
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

              <ul ref={listRef} className="space-y-2 pb-16">
                {filteredWords.map((w) => (
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
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-medium text-surface-100" lang="de">{w.word}</p>
                          {w.cefrLevel && <CEFRBadge level={w.cefrLevel} size="sm" />}
                        </div>
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

