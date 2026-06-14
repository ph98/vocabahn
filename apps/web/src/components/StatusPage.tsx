import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api';

function StatusDot({ up }: { up: boolean }) {
  return (
    <span
      role="img"
      aria-label={up ? 'up' : 'down'}
      className={`inline-block size-2.5 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
    />
  );
}

export function StatusPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  return (
    <section
      aria-label="System status"
      className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg shadow-black/20"
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
