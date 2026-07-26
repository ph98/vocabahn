import { useGSAP } from '@gsap/react';
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { prefersReducedMotion } from '../lib/motion';
import {
  createDeck,
  deleteDeck,
  fetchDeck,
  fetchDecks,
  removeWordFromDeck,
  updateDeck,
  importWordsToDeck,
} from '../api';
import { useStaggerIn } from '../lib/motion';
import { PullToRefresh } from './PullToRefresh';
import type { DeckSummary } from '@vocabahn/shared';

// ── Deck list page ────────────────────────────────────────────────────────────

function CreateDeckModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!panelRef.current || prefersReducedMotion()) return;
      gsap.from(panelRef.current, { opacity: 0, y: 32, duration: 0.3, ease: 'power3.out' });
    },
    { scope: panelRef },
  );

  const mutation = useMutation({
    mutationFn: () => createDeck({ title: title.trim(), description: description.trim() || undefined, isPublic }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create deck"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panelRef} className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">New deck</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="deck-title" className="mb-1 block text-sm text-surface-400">
              Title <span aria-hidden="true">*</span>
            </label>
            <input
              id="deck-title"
              type="text"
              required
              maxLength={80}
              value={title}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="deck-description" className="mb-1 block text-sm text-surface-400">
              Description (optional)
            </label>
            <textarea
              id="deck-description"
              maxLength={300}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-2 text-sm placeholder:text-surface-500 transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              placeholder="A few words about this deck…"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3 select-none">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="size-4 accent-indigo-500"
            />
            <span className="text-sm">Make this deck public</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-xl border border-surface-700 text-sm transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || mutation.isPending}
              className="min-h-11 flex-1 rounded-xl bg-indigo-500 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
            >
              {mutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
          {mutation.isError && (
            <p className="text-sm text-accent-red">Couldn't create deck. Please try again.</p>
          )}
        </form>
      </div>
    </div>
  );
}

function DeckCard({ deck }: { deck: DeckSummary }) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => deleteDeck(deck.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="rounded-2xl border border-surface-800 bg-surface-900 p-5 shadow-lg shadow-black/20 transition-colors hover:border-surface-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{deck.title}</h3>
            {deck.isPublic ? (
              <span className="rounded-full border border-indigo-400/40 px-2 py-0.5 text-xs text-accent-indigo">
                Public
              </span>
            ) : (
              <span className="rounded-full border border-surface-700 px-2 py-0.5 text-xs text-surface-500">
                Private
              </span>
            )}
          </div>
          {deck.description && (
            <p className="mt-1 text-sm text-surface-400 line-clamp-2">{deck.description}</p>
          )}
          {!deck.isOwner && deck.ownerName && (
            <p className="mt-1 text-xs text-surface-500">by {deck.ownerName}</p>
          )}
          <p className="mt-2 text-sm text-surface-500">{deck.wordCount} words</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {deck.wordCount > 0 && (
          <Link
            to={`/review?deckId=${deck.id}`}
            className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Review
          </Link>
        )}
        <Link
          to={`/decks/${deck.id}`}
          className="min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          View words
        </Link>
        {deck.isOwner && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm transition-colors hover:border-red-400/60 hover:bg-red-950/30 hover:text-accent-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Delete
          </button>
        )}
        {deck.isOwner && confirmDelete && (
          <>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="min-h-11 rounded-xl border border-red-400/60 bg-red-950/30 px-4 py-2.5 text-sm text-accent-red transition-colors hover:bg-red-950/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-11 rounded-xl border border-surface-700 px-3 py-2.5 text-sm transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function DecksPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['decks'], queryFn: fetchDecks });
  const [showCreate, setShowCreate] = useState(false);
  const myListRef = useRef<HTMLUListElement>(null);
  const pubListRef = useRef<HTMLUListElement>(null);
  useStaggerIn(myListRef, 'li', [data]);
  useStaggerIn(pubListRef, 'li', [data]);

  return (
    <section aria-label="Decks" className="space-y-6">
      <PullToRefresh onRefresh={refetch} />

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-surface-400">Decks</h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          + New deck
        </button>
      </div>

      {isPending && <p aria-live="polite">Loading decks…</p>}
      {isError && <p aria-live="polite" className="text-accent-red">Couldn't load decks.</p>}

      {data && (
        <>
          <section aria-label="My decks">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-surface-500">My decks</h3>
            {data.myDecks.length === 0 ? (
              <p className="text-sm text-surface-400">You haven't created any decks yet.</p>
            ) : (
              <ul ref={myListRef} className="space-y-4">
                {data.myDecks.map((deck) => <DeckCard key={deck.id} deck={deck} />)}
              </ul>
            )}
          </section>

          {data.publicDecks.length > 0 && (
            <section aria-label="Public decks from others">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-surface-500">
                Public decks from the community
              </h3>
              <ul ref={pubListRef} className="space-y-4">
                {data.publicDecks.map((deck) => <DeckCard key={deck.id} deck={deck} />)}
              </ul>
            </section>
          )}
        </>
      )}

      {showCreate && <CreateDeckModal onClose={() => setShowCreate(false)} />}
    </section>
  );
}

// ── Deck detail page ──────────────────────────────────────────────────────────

function ImportModal({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [wordsText, setWordsText] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!panelRef.current || prefersReducedMotion()) return;
      gsap.from(panelRef.current, { opacity: 0, y: 32, duration: 0.3, ease: 'power3.out' });
    },
    { scope: panelRef },
  );

  const mutation = useMutation({
    mutationFn: () => {
      const words = wordsText
        .split(/[\n,]/)
        .map(w => w.trim())
        .filter(w => w.length > 0);
      return importWordsToDeck(deckId, words);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
      const failedMsg = data.failed.length > 0 ? `\nFailed to find ${data.failed.length} words: ${data.failed.join(', ')}` : '';
      alert(`Successfully imported ${data.imported} words.${failedMsg}`);
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import words"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panelRef} className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">Import words</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="import-words" className="mb-1 block text-sm text-surface-400">
              Paste words (comma or newline separated)
            </label>
            <textarea
              id="import-words"
              required
              rows={8}
              value={wordsText}
              onChange={(e) => setWordsText(e.target.value)}
              className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-2 text-sm transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl px-4 text-sm font-medium transition-colors hover:bg-surface-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !wordsText.trim()}
              className="min-h-11 rounded-xl bg-indigo-500 px-6 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-60"
            >
              {mutation.isPending ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeckDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(false);

  const { data: deck, isPending, isError } = useQuery({
    queryKey: ['deck', id],
    queryFn: () => fetchDeck(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateDeck(id!, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        isPublic: editIsPublic,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deck', id] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      setEditing(false);
    },
  });

  const removeWordMutation = useMutation({
    mutationFn: (entryId: string) => removeWordFromDeck(id!, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deck', id] }),
  });

  const startEditing = () => {
    if (!deck) return;
    setEditTitle(deck.title);
    setEditDescription(deck.description ?? '');
    setEditIsPublic(deck.isPublic);
    setEditing(true);
  };

  if (isPending) return <p aria-live="polite">Loading deck…</p>;
  if (isError || !deck) return <p aria-live="polite" className="text-accent-red">Deck not found.</p>;

  return (
    <section aria-label="Deck detail" className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/decks')}
        className="mb-2 min-h-11 rounded-xl border border-surface-700 px-4 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ← Back to decks
      </button>

      {editing ? (
        <form
          onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }}
          className="space-y-3 rounded-2xl border border-surface-800 bg-surface-900 p-5"
        >
          <input
            type="text"
            required
            maxLength={80}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-surface-700 bg-surface-950 px-4 text-sm transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          />
          <textarea
            maxLength={300}
            rows={2}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-2 text-sm transition-colors focus:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          />
          <label className="flex cursor-pointer items-center gap-3 select-none">
            <input
              type="checkbox"
              checked={editIsPublic}
              onChange={(e) => setEditIsPublic(e.target.checked)}
              className="size-4 accent-indigo-500"
            />
            <span className="text-sm">Public deck</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-11 flex-1 rounded-xl border border-surface-700 text-sm transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="min-h-11 flex-1 rounded-xl bg-indigo-500 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{deck.title}</h2>
                {deck.isPublic ? (
                  <span className="rounded-full border border-indigo-400/40 px-2 py-0.5 text-xs text-accent-indigo">
                    Public
                  </span>
                ) : (
                  <span className="rounded-full border border-surface-700 px-2 py-0.5 text-xs text-surface-500">
                    Private
                  </span>
                )}
              </div>
              {deck.description && <p className="mt-1 text-sm text-surface-400">{deck.description}</p>}
              <p className="mt-2 text-sm text-surface-500">{deck.wordCount} words</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {deck.words.length > 0 && (
                <Link
                  to={`/review?deckId=${deck.id}`}
                  className="min-h-11 shrink-0 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Start review
                </Link>
              )}
              {deck.isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowImport(true)}
                    className="min-h-11 shrink-0 rounded-xl border border-surface-700 px-3 text-sm transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    onClick={startEditing}
                    className="min-h-11 shrink-0 rounded-xl border border-surface-700 px-3 text-sm transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deck.words.length === 0 ? (
        <p className="text-sm text-surface-400">
          No words yet. Browse the{' '}
          <Link to="/" className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            dictionary
          </Link>{' '}
          and add words from each entry.
        </p>
      ) : (
        <ul className="space-y-2">
          {deck.words.map((w) => (
            <li
              key={w.dictionaryEntryId}
              className="flex items-center gap-3 rounded-2xl border border-surface-800 bg-surface-900 p-4"
            >
              {w.emoji && <span className="shrink-0 text-2xl" aria-hidden="true">{w.emoji}</span>}
              <div className="min-w-0 flex-1">
                <Link
                  to={`/word/${encodeURIComponent(w.word)}`}
                  lang="de"
                  className="font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {w.word}
                </Link>
                {w.translation && <p className="truncate text-sm text-surface-400">{w.translation}</p>}
              </div>
              {deck.isOwner && (
                <button
                  type="button"
                  onClick={() => removeWordMutation.mutate(w.dictionaryEntryId)}
                  disabled={removeWordMutation.isPending}
                  aria-label={`Remove ${w.word} from deck`}
                  className="min-h-11 min-w-11 shrink-0 rounded-xl border border-surface-700 text-sm transition-colors hover:border-red-400/60 hover:bg-red-950/30 hover:text-accent-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showImport && <ImportModal deckId={id!} onClose={() => setShowImport(false)} />}
    </section>
  );
}
