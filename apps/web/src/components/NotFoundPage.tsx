import { Link } from 'react-router-dom';
import { Home, Compass } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="relative mb-6 flex items-center justify-center size-20 rounded-3xl bg-surface-800/80 border border-surface-700/60 shadow-xl backdrop-blur-xl text-accent-indigo">
        <Compass className="size-10 animate-pulse" aria-hidden="true" />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-surface-100 sm:text-5xl mb-3">
        404 — Page Not Found
      </h1>
      <p className="max-w-md text-base text-surface-400 mb-8 leading-relaxed">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/25 transition-all hover:scale-105 active:scale-95"
      >
        <Home className="size-5" aria-hidden="true" />
        <span>Return to Dashboard</span>
      </Link>
    </div>
  );
}
