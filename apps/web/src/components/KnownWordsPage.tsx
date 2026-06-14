import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchKnownWords, undoKnownWord } from '../api';

export function KnownWordsPage() {
  const queryClient = useQueryClient();
  const { data: words, isPending, isError } = useQuery({ queryKey: ['known-words'], queryFn: fetchKnownWords });

  const undoMutation = useMutation({
    mutationFn: undoKnownWord,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['known-words'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <section aria-label="Known words" className="space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">Known words</h2>
      <p className="text-sm text-neutral-400">
        Words the system has marked as known — they're scheduled far out instead of cluttering your reviews. Undo
        any of these to bring a word back into rotation.
      </p>

      {isPending && <p aria-live="polite">Loading known words…</p>}
      {isError && <p aria-live="polite" className="text-red-400">Couldn't load known words.</p>}

      {words && words.length === 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-lg shadow-black/20">
          <p>Nothing here yet — words you breeze through will show up as you review.</p>
          <Link
            to="/review"
            className="mt-4 inline-block min-h-11 rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Go to review
          </Link>
        </div>
      )}

      {words && words.length > 0 && (
        <ul className="space-y-2">
          {words.map((w) => (
            <li
              key={w.cardId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-lg shadow-black/20"
            >
              <div className="flex items-center gap-3">
                {w.emoji && <span className="text-2xl" aria-hidden="true">{w.emoji}</span>}
                <div>
                  <p className="font-medium" lang="de">
                    {w.word}
                  </p>
                  <p className="text-sm text-neutral-400">{w.translation ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs uppercase tracking-wide text-neutral-400">
                  {w.reason === 'AUTO' ? 'Auto' : 'Marked by you'}
                </span>
                <button
                  type="button"
                  onClick={() => undoMutation.mutate(w.cardId)}
                  disabled={undoMutation.isPending}
                  className="min-h-11 rounded-xl border border-neutral-700 px-3 py-2.5 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
                >
                  Undo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
