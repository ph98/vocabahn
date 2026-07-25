/** Inline SVG illustrations and icons that respect the current color-scheme via currentColor or theme variables. */

export function IllustrationDictionary({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 160"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      {/* Book spine */}
      <rect x="20" y="20" width="160" height="120" rx="8" fill="currentColor" opacity=".06" />
      <rect x="20" y="20" width="14" height="120" rx="4" fill="currentColor" opacity=".15" />
      {/* Page lines */}
      <rect x="46" y="40" width="110" height="6" rx="3" fill="currentColor" opacity=".25" />
      <rect x="46" y="56" width="90" height="6" rx="3" fill="currentColor" opacity=".18" />
      <rect x="46" y="72" width="100" height="6" rx="3" fill="currentColor" opacity=".18" />
      <rect x="46" y="88" width="70" height="6" rx="3" fill="currentColor" opacity=".18" />
      {/* Magnifier */}
      <circle cx="140" cy="110" r="22" fill="currentColor" opacity=".08" />
      <circle cx="140" cy="110" r="22" stroke="currentColor" strokeWidth="5" opacity=".4" />
      <line x1="156" y1="126" x2="170" y2="140" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".4" />
      {/* Letter A */}
      <text x="130" y="117" fontSize="20" fontWeight="700" fill="currentColor" opacity=".5" fontFamily="serif">A</text>
    </svg>
  );
}

export function IllustrationFlashcard({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 160"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      {/* Back card */}
      <rect x="30" y="30" width="130" height="90" rx="10" fill="currentColor" opacity=".06" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".15" transform="rotate(-6 95 75)" />
      {/* Front card */}
      <rect x="30" y="30" width="130" height="90" rx="10" fill="currentColor" opacity=".1" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".3" />
      {/* German word placeholder */}
      <rect x="55" y="52" width="90" height="12" rx="6" fill="currentColor" opacity=".35" />
      {/* Divider */}
      <line x1="55" y1="78" x2="145" y2="78" stroke="currentColor" strokeWidth="1.5" opacity=".2" />
      {/* Translation placeholder */}
      <rect x="65" y="88" width="70" height="8" rx="4" fill="currentColor" opacity=".2" />
      {/* Stars */}
      <text x="62" y="72" fontSize="14" fill="currentColor" opacity=".4">⭐</text>
      <text x="78" y="72" fontSize="14" fill="currentColor" opacity=".25">⭐</text>
      <text x="94" y="72" fontSize="14" fill="currentColor" opacity=".15">⭐</text>
    </svg>
  );
}

export function IllustrationTrophy({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 160"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      {/* Trophy cup */}
      <path
        d="M75 30 h50 v50 q0 20 -25 25 q-25 -5 -25 -25 Z"
        fill="currentColor"
        opacity=".15"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity=".3"
      />
      {/* Handles */}
      <path d="M75 50 q-25 0 -20 20 q5 15 20 15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".3" />
      <path d="M125 50 q25 0 20 20 q-5 15 -20 15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".3" />
      {/* Stem */}
      <rect x="93" y="105" width="14" height="22" rx="3" fill="currentColor" opacity=".2" />
      {/* Base */}
      <rect x="72" y="127" width="56" height="10" rx="5" fill="currentColor" opacity=".25" />
      {/* Star */}
      <text x="89" y="76" fontSize="22" fill="currentColor" opacity=".5">★</text>
    </svg>
  );
}

export function IllustrationEmpty({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 160"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <rect x="50" y="50" width="100" height="80" rx="8" stroke="currentColor" strokeWidth="2" opacity=".2" strokeDasharray="6 4" />
      <rect x="68" y="70" width="64" height="8" rx="4" fill="currentColor" opacity=".1" />
      <rect x="68" y="86" width="44" height="8" rx="4" fill="currentColor" opacity=".08" />
      <circle cx="100" cy="35" r="14" fill="currentColor" opacity=".1" />
      <line x1="100" y1="28" x2="100" y2="42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".4" />
      <line x1="93" y1="35" x2="107" y2="35" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".4" />
    </svg>
  );
}

export function IllustrationEmptyQueue({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" aria-hidden="true" className={className} fill="none">
      <circle cx="100" cy="70" r="45" fill="currentColor" opacity=".08" />
      <circle cx="100" cy="70" r="32" stroke="currentColor" strokeWidth="3" opacity=".2" strokeDasharray="4 4" />
      <path d="M 85 70 L 95 80 L 115 58" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
      <text x="100" y="135" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" opacity=".5">Queue Clear!</text>
    </svg>
  );
}

export function IllustrationEmptySearch({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" aria-hidden="true" className={className} fill="none">
      <circle cx="90" cy="65" r="28" fill="currentColor" opacity=".08" />
      <circle cx="90" cy="65" r="22" stroke="currentColor" strokeWidth="3" opacity=".3" />
      <line x1="106" y1="81" x2="124" y2="99" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".4" />
      <text x="100" y="135" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" opacity=".5">No Results</text>
    </svg>
  );
}

export function IllustrationEmptyCourse({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" aria-hidden="true" className={className} fill="none">
      <rect x="50" y="35" width="100" height="75" rx="10" fill="currentColor" opacity=".08" stroke="currentColor" strokeWidth="2" />
      <line x1="100" y1="60" x2="100" y2="85" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".4" />
      <line x1="87.5" y1="72.5" x2="112.5" y2="72.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".4" />
      <text x="100" y="135" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" opacity=".5">Start Course</text>
    </svg>
  );
}

export function IllustrationStreak({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 160"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M100 20 C120 40 135 60 125 80 C120 70 110 68 108 75 C106 68 96 65 92 75 C85 60 80 45 100 20 Z"
        fill="currentColor"
        opacity=".2"
      />
      <path
        d="M100 40 C110 55 115 70 105 85 C102 78 97 76 95 82 C90 70 88 58 100 40 Z"
        fill="currentColor"
        opacity=".35"
      />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect
          key={i}
          x={52 + i * 16}
          y="110"
          width="10"
          height="10"
          rx="2"
          fill="currentColor"
          opacity={i < 5 ? 0.3 : 0.1}
        />
      ))}
    </svg>
  );
}

/* Custom Unified UI Icons */
export function ModeIconFlashcards({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="6" width="16" height="12" rx="2" opacity="0.4" />
      <rect x="6" y="10" width="16" height="12" rx="2" />
    </svg>
  );
}

export function ModeIconWriting({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function ModeIconDiagnostics({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

export function ModeIconDictionary({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
}
