import { useQuery } from '@tanstack/react-query';
import { healthResponseSchema } from '@vocabahn/shared';
import axios from 'axios';

function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await axios.get('/api/v1/health');
      return healthResponseSchema.parse(data);
    },
    refetchInterval: 5000,
  });
}

function StatusDot({ up }: { up: boolean }) {
  return (
    <span
      role="img"
      aria-label={up ? 'up' : 'down'}
      className={`inline-block size-2.5 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
    />
  );
}

export default function App() {
  const { data, isPending, isError } = useHealth();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-neutral-950 px-6 text-neutral-100">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Vocabahn</h1>
        <p className="mt-2 text-neutral-400">
          German vocabulary, <span lang="de">Wort für Wort</span>.
        </p>
      </header>

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

      <p className="text-sm text-neutral-500">Phase 0 — foundation</p>
    </main>
  );
}
