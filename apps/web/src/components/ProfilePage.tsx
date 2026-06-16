import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, logout } from '../api';

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(['me'], null),
  });

  return (
    <section
      aria-label="Profile"
      className="w-full rounded-2xl border border-surface-800 bg-surface-900 p-6 shadow-lg shadow-black/20"
    >
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-surface-400">Profile</h2>
      {isPending && <p aria-live="polite">Checking session…</p>}
      {!isPending && !user && (
        <a
          href="/api/v1/auth/google"
          className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl bg-indigo-500 px-4 py-2.5 font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
              className="size-11 rounded-full ring-2 ring-surface-800"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user.name ?? user.email}</p>
            <p className="truncate text-sm text-surface-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            className="min-h-11 rounded-xl border border-surface-700 px-4 text-sm transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Sign out
          </button>
        </div>
      )}
    </section>
  );
}
