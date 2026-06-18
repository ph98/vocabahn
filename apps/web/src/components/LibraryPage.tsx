import { useState } from 'react';
import { CoursesPage } from './CoursesPage';
import { DecksPage } from './DecksPage';

export function LibraryPage() {
  const [tab, setTab] = useState<'courses' | 'decks'>('courses');

  return (
    <div className="space-y-6 w-full">
      <div className="flex w-full items-center justify-center p-1 rounded-2xl bg-surface-900 border border-surface-800 shadow-sm">
        <button
          type="button"
          onClick={() => setTab('courses')}
          className={`flex-1 min-h-11 rounded-xl text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            tab === 'courses' ? 'bg-surface-800 text-surface-100 shadow-sm border border-surface-700/50' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 border border-transparent'
          }`}
        >
          Courses
        </button>
        <button
          type="button"
          onClick={() => setTab('decks')}
          className={`flex-1 min-h-11 rounded-xl text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            tab === 'decks' ? 'bg-surface-800 text-surface-100 shadow-sm border border-surface-700/50' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 border border-transparent'
          }`}
        >
          Decks
        </button>
      </div>

      <div>
        {tab === 'courses' && <CoursesPage />}
        {tab === 'decks' && <DecksPage />}
      </div>
    </div>
  );
}
