import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchKnowledgeSuggestions, bulkMarkKnownWords } from '../api';
import { PullToRefresh } from './PullToRefresh';

export function KnownWordsDiscover() {
  const queryClient = useQueryClient();
  const { data: suggestions, isPending, refetch } = useQuery({ 
    queryKey: ['known-words-suggestions'], 
    queryFn: () => fetchKnowledgeSuggestions(100) 
  });
  
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['known-words'] });
    void queryClient.invalidateQueries({ queryKey: ['known-words-suggestions'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const bulkMarkMutation = useMutation({
    mutationFn: bulkMarkKnownWords,
    onSuccess: () => {
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

  const markSelected = () => {
    if (selected.size === 0) return;
    bulkMarkMutation.mutate([...selected]);
  };

  return (
    <div className="space-y-4">
      <PullToRefresh onRefresh={refetch} />
      
      <p className="text-sm text-surface-400">
        Tap the words you already know. We'll skip them in your lessons so you can focus on what's new.
      </p>

      {suggestions && suggestions.length > 0 && (
        (() => {
          const milestones = [10, 25, 50, 100];
          const target = milestones.find(m => selected.size < m) || 100;
          const prevTarget = milestones[milestones.indexOf(target) - 1] || 0;
          const isMilestoneHit = selected.size > 0 && milestones.includes(selected.size);
          const displayTarget = isMilestoneHit ? selected.size : target;
          const progressPercent = Math.min(100, (selected.size / displayTarget) * 100);

          return (
            <div className="flex items-center gap-4 rounded-xl bg-surface-900 p-4 border border-surface-700 shadow-sm">
              <div className="flex-1 space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-surface-300">Selection Target</span>
                  <span className="text-accent-indigo">{selected.size} / {displayTarget}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-800">
                  <div 
                    className="h-full bg-accent-indigo transition-all duration-500 ease-out" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <span className={`text-2xl transition-all duration-500 ${isMilestoneHit ? 'scale-125 opacity-100 grayscale-0' : 'scale-100 opacity-50 grayscale'}`}>
                🎉
              </span>
            </div>
          );
        })()
      )}

      {isPending && <p aria-live="polite">Loading suggestions…</p>}

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 pb-24">
          {suggestions.map((w: any) => {
            const isSelected = selected.has(w.id);
            return (
              <button
                key={w.id}
                onClick={() => toggle(w.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                  isSelected 
                    ? 'border-accent-indigo bg-accent-indigo/10 text-accent-indigo shadow-[0_0_12px_rgba(129,140,248,0.2)]' 
                    : 'border-surface-700 bg-surface-900 text-surface-300 hover:border-surface-500 hover:bg-surface-800'
                }`}
              >
                {w.emoji && <span>{w.emoji}</span>}
                <span lang="de">{w.word}</span>
                <span className="text-xs text-surface-400 max-w-24 truncate">{w.translation}</span>
              </button>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-[80px] md:bottom-8 inset-x-0 z-50 flex justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-surface-700 bg-surface-900/90 backdrop-blur-xl p-3 pl-6 shadow-2xl">
            <span className="text-sm font-semibold text-accent-indigo">{selected.size} selected</span>
            <button
              onClick={markSelected}
              disabled={bulkMarkMutation.isPending}
              className="rounded-xl bg-accent-indigo px-6 py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {bulkMarkMutation.isPending ? 'Marking...' : 'Mark as known'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
