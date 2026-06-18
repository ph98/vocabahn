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
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100 shadow-[0_0_12px_rgba(129,140,248,0.3)]' 
                    : 'border-surface-700 bg-surface-900 text-surface-300 hover:border-surface-500 hover:bg-surface-800'
                }`}
              >
                {w.emoji && <span>{w.emoji}</span>}
                <span lang="de">{w.word}</span>
                <span className="text-xs text-surface-500 max-w-24 truncate">{w.translation}</span>
              </button>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-[80px] md:bottom-8 inset-x-0 z-50 flex justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-indigo-500/30 bg-surface-900/90 backdrop-blur-xl p-3 pl-6 shadow-2xl shadow-indigo-900/20">
            <span className="text-sm font-semibold text-indigo-100">{selected.size} selected</span>
            <button
              onClick={markSelected}
              disabled={bulkMarkMutation.isPending}
              className="rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
            >
              {bulkMarkMutation.isPending ? 'Marking...' : 'Mark as known'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
