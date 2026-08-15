import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchKnowledgeSuggestions, bulkMarkKnownWords, markWordKnown } from '../api';
import { PullToRefresh } from './PullToRefresh';
import { trackEvent } from '../lib/telemetry';
import { Search, Sparkles, Check, CheckCheck, Compass } from 'lucide-react';
import { CEFRBadge } from './CEFRBadge';
import { MAIN_CEFR_LEVELS } from '@vocabahn/shared';

interface KnownWordsDiscoverProps {
  onLaunchDiagnostic?: () => void;
}

export function KnownWordsDiscover({ onLaunchDiagnostic }: KnownWordsDiscoverProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: suggestions, isPending, refetch } = useQuery({
    queryKey: ['known-words-suggestions', selectedLevel, searchQuery],
    queryFn: () =>
      fetchKnowledgeSuggestions({
        limit: 120,
        cefrLevel: selectedLevel ?? undefined,
        search: searchQuery.trim() || undefined,
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['known-words'] });
    void queryClient.invalidateQueries({ queryKey: ['known-words-suggestions'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const markOneMutation = useMutation({
    mutationFn: (id: string) => markWordKnown(id),
    onSuccess: () => {
      invalidate();
    },
  });

  const bulkMarkMutation = useMutation({
    mutationFn: (ids: string[]) => bulkMarkKnownWords(ids),
    onSuccess: (_result, ids) => {
      trackEvent('known_words_bulk_mark', { word_count: ids.length });
      setSelected(new Set());
      invalidate();
    },
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllVisible = () => {
    if (!suggestions || suggestions.length === 0) return;
    const visibleIds = suggestions.map((w: { id: string }) => w.id);
    const allSelected = visibleIds.every((id: string) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  };

  const markSelected = () => {
    if (selected.size === 0) return;
    bulkMarkMutation.mutate([...selected]);
  };

  const visibleIds = suggestions?.map((w: { id: string }) => w.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id: string) => selected.has(id));

  return (
    <div className="space-y-4">
      <PullToRefresh onRefresh={refetch} />

      {/* Fast Calibration Banner */}
      {onLaunchDiagnostic && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-surface-900 to-indigo-950/20 p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300">
              <Sparkles className="size-3.5" />
              Fast 2-Minute Calibration
            </div>
            <p className="text-xs text-surface-300">
              Already know hundreds or thousands of words? Test your exact CEFR sub-level and graduate mastered words automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onLaunchDiagnostic}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 transition-all active:scale-95"
          >
            <Compass className="size-3.5" />
            Start Diagnostic
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="space-y-3 rounded-2xl border border-surface-800 bg-surface-900 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-surface-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search unlearned words (e.g. 'sprechen' or 'speak')…"
            className="w-full rounded-xl border border-surface-700 bg-surface-950 py-2 pl-9 pr-4 text-sm text-surface-100 placeholder-surface-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400 hover:text-surface-200"
            >
              Clear
            </button>
          )}
        </div>

        {/* Level Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-surface-400 font-medium mr-1">Level:</span>
          <button
            type="button"
            onClick={() => setSelectedLevel(null)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedLevel === null
                ? 'bg-indigo-600 text-white'
                : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
            }`}
          >
            All
          </button>
          {MAIN_CEFR_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setSelectedLevel(selectedLevel === lvl ? null : lvl)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedLevel === lvl
                  ? 'bg-indigo-600 text-white'
                  : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
              }`}
            >
              {lvl}
            </button>
          ))}

          {suggestions && suggestions.length > 0 && (
            <button
              type="button"
              onClick={selectAllVisible}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              <CheckCheck className="size-3.5" />
              {allVisibleSelected ? 'Deselect all' : 'Select all visible'}
            </button>
          )}
        </div>
      </div>

      {isPending && <p aria-live="polite" className="text-xs text-surface-400">Loading unlearned words…</p>}

      {/* Words Grid */}
      {suggestions && suggestions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1 pb-24">
          {suggestions.map(
            (w: { id: string; emoji?: string | null; word: string; translation?: string | null; cefrLevel?: string | null }) => {
              const isSelected = selected.has(w.id);
              return (
                <label
                  key={w.id}
                  className={`group relative flex items-center justify-between gap-3 rounded-2xl border p-3 cursor-pointer select-none transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500/15 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'border-surface-800 bg-surface-900/90 hover:border-surface-700 hover:bg-surface-850'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(w.id)}
                      aria-label={`Select ${w.word}`}
                      className="size-4 shrink-0 accent-indigo-500"
                    />
                    {w.emoji && <span className="text-base shrink-0">{w.emoji}</span>}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span lang="de" className="font-semibold text-sm text-surface-100 truncate">
                          {w.word}
                        </span>
                        {w.cefrLevel && <CEFRBadge level={w.cefrLevel} size="sm" />}
                      </div>
                      <p className="truncate text-xs text-surface-400">
                        {w.translation ?? '—'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    title="Mark word as known"
                    disabled={markOneMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      markOneMutation.mutate(w.id);
                    }}
                    className="shrink-0 rounded-xl border border-surface-700 bg-surface-800 p-2 text-surface-300 hover:border-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
                  >
                    <Check className="size-3.5" />
                  </button>
                </label>
              );
            },
          )}
        </div>
      )}


      {suggestions && suggestions.length === 0 && (
        <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-8 text-center space-y-2">
          <p className="text-sm font-medium text-surface-200">No matching unlearned words found</p>
          <p className="text-xs text-surface-400">
            {searchQuery ? `No results for "${searchQuery}" in ${selectedLevel ?? 'all levels'}.` : 'All words in this category are already marked as known or learned!'}
          </p>
        </div>
      )}

      {/* Floating Action Bar for Bulk Selection */}
      {selected.size > 0 && (
        <div className="fixed bottom-[80px] md:bottom-8 inset-x-0 z-50 flex justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-surface-700 bg-surface-900/95 backdrop-blur-xl p-3 pl-6 shadow-2xl">
            <span className="text-sm font-semibold text-indigo-300">{selected.size} selected</span>
            <button
              onClick={markSelected}
              disabled={bulkMarkMutation.isPending}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-500 hover:to-indigo-400 active:scale-95 disabled:opacity-50 transition-all"
            >
              {bulkMarkMutation.isPending ? 'Marking…' : `Mark ${selected.size} as known`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

