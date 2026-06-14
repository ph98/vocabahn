import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { fetchHealth, fetchMe } from './api';
import { CourseDetailPage } from './components/CourseDetailPage';
import { CoursesPage } from './components/CoursesPage';
import { DictionaryCard, DictionaryEntryPage } from './components/DictionaryCard';
import { ProfilePage } from './components/ProfilePage';
import { ReviewSession } from './components/ReviewSession';
import { StatusPage } from './components/StatusPage';

const navLinkClass = (isActive: boolean) =>
  `min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
    isActive
      ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-950/50'
      : 'text-neutral-300 hover:bg-neutral-800'
  }`;

const navLinkClassName = ({ isActive }: { isActive: boolean }) => navLinkClass(isActive);

const iconLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex size-9 items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
    isActive ? 'border-indigo-400' : 'border-neutral-800 hover:border-neutral-600'
  }`;

function Nav() {
  const { pathname } = useLocation();
  const dictionaryActive = pathname === '/' || pathname.startsWith('/word/');

  return (
    <nav
      aria-label="Main"
      className="flex w-full max-w-2xl flex-wrap justify-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-2 shadow-lg shadow-black/20"
    >
      <Link to="/" className={navLinkClass(dictionaryActive)}>
        Dictionary
      </Link>
      <NavLink to="/courses" className={navLinkClassName}>
        Courses
      </NavLink>
      <NavLink to="/review" className={navLinkClassName}>
        Review
      </NavLink>
    </nav>
  );
}

/** Small status dot reflecting overall API/db/redis health, linking to /status. */
function StatusLink() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });
  const up = !isError && data?.services.database === 'up' && data?.services.redis === 'up';

  return (
    <NavLink to="/status" aria-label="System status" className={iconLinkClassName}>
      <span
        role="img"
        aria-label={up ? 'up' : 'down'}
        className={`size-2.5 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
      />
    </NavLink>
  );
}

/** Small avatar (or placeholder) linking to /profile. */
function ProfileLink() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  return (
    <NavLink to="/profile" aria-label="Profile" className={iconLinkClassName}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full rounded-full" />
      ) : (
        <span aria-hidden="true">👤</span>
      )}
    </NavLink>
  );
}

export default function App() {
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-neutral-950 px-4 py-8 text-neutral-100 sm:px-6 sm:py-10">
      <header className="flex w-full max-w-2xl items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Vocab<span className="text-indigo-400">ahn</span>
          </h1>
          <p className="mt-2 text-neutral-400">
            German vocabulary, <span lang="de">Wort für Wort</span>.
          </p>
        </div>
        {!isPending && (
          <div className="flex shrink-0 items-center gap-2">
            <StatusLink />
            <ProfileLink />
          </div>
        )}
      </header>

      {!isPending && !user && (
        <div className="w-full max-w-sm">
          <ProfilePage />
        </div>
      )}

      {user && (
        <>
          <Nav />
          <div className="w-full max-w-2xl">
            <Routes>
              <Route path="/" element={<DictionaryCard />} />
              <Route path="/word/:word" element={<DictionaryEntryPage />} />
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/courses/:slug" element={<CourseDetailPage />} />
              <Route path="/review" element={<ReviewSession />} />
              <Route path="/profile" element={<div className="mx-auto max-w-sm"><ProfilePage /></div>} />
              <Route path="/status" element={<div className="mx-auto max-w-sm"><StatusPage /></div>} />
            </Routes>
          </div>
        </>
      )}

      <p className="text-sm text-neutral-500">Phase 2 — courses & reviews</p>
    </main>
  );
}
