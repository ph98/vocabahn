import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@vocabahn/shared';
import { fetchHealth, fetchMe, logout } from './api';
import { DictionaryCard } from './components/DictionaryCard';

function StatusDot({ up }: { up: boolean }) {
  return (
    <span
      role="img"
      aria-label={up ? 'up' : 'down'}
      className={`inline-block size-2.5 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
    />
  );
}

function AccountCard({ user, isPending }: { user: User | null | undefined; isPending: boolean }) {
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(['me'], null),
  });

  return (
    <section
      aria-label="Account"
      className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
    >
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-400">
        Account
      </h2>
      {isPending && <p aria-live="polite">Checking session…</p>}
      {!isPending && !user && (
        <a
          href="/api/v1/auth/google"
          className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-2.5 font-medium text-neutral-900 transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Sign in with Google
        </a>
      )}
      {user && (
        <div className="flex items-center gap-4">
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-11 rounded-full"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user.name ?? user.email}</p>
            <p className="truncate text-sm text-neutral-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            className="min-h-11 rounded-xl border border-neutral-700 px-4 text-sm transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Sign out
          </button>
        </div>
      )}
    </section>
  );
}

function SystemStatusCard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  return (
    <section
      aria-label="System status"
      className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
    >
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-400">
        System status
      </h2>
      {isPending && <p aria-live="polite">Checking…</p>}
      {isError && (
        <p aria-live="polite" className="text-red-400">
          API unreachable — is <code>pnpm dev</code> running?
        </p>
      )}
      {data && (
        <ul aria-live="polite" className="space-y-3">
          <li className="flex items-center justify-between">
            <span>API</span>
            <StatusDot up />
          </li>
          <li className="flex items-center justify-between">
            <span>PostgreSQL</span>
            <StatusDot up={data.services.database === 'up'} />
          </li>
          <li className="flex items-center justify-between">
            <span>Redis</span>
            <StatusDot up={data.services.redis === 'up'} />
          </li>
        </ul>
      )}
    </section>
  );
}

export default function App() {
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-neutral-950 px-6 py-10 text-neutral-100">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Vocabahn</h1>
        <p className="mt-2 text-neutral-400">
          German vocabulary, <span lang="de">Wort für Wort</span>.
        </p>
      </header>

      <AccountCard user={user} isPending={isPending} />
      {user && <DictionaryCard />}
      <SystemStatusCard />

      <p className="text-sm text-neutral-500">Phase 1 — data & dictionary</p>
    </main>
  );
}
