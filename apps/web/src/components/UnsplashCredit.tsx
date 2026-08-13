// Unsplash's API guidelines require every photo to credit its photographer,
// with links back to their profile and to Unsplash, and require those links to
// carry UTM parameters naming the application. Both the dictionary entry image
// and the story banner render through this one component so the two cannot
// drift apart — a second variant is a second way to fall out of compliance.

/** Must match the application name registered with Unsplash. */
const UTM = 'utm_source=vocabahn&utm_medium=referral';

/** Appends the referral parameters Unsplash requires, preserving any query. */
function withReferral(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${UTM}`;
}

const LINK =
  'underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export function UnsplashCredit({
  authorName,
  authorUrl,
  photoUrl,
  className,
}: {
  authorName: string;
  /** The photographer's Unsplash profile. Null falls back to plain text. */
  authorUrl?: string | null;
  /** The photo's own page. Null links the Unsplash home page instead. */
  photoUrl?: string | null;
  className?: string;
}) {
  return (
    <figcaption className={`mt-1 text-xs text-surface-500 ${className ?? ''}`}>
      Photo by{' '}
      {authorUrl ? (
        <a href={withReferral(authorUrl)} target="_blank" rel="noopener noreferrer" className={LINK}>
          {authorName}
        </a>
      ) : (
        authorName
      )}{' '}
      on{' '}
      <a
        href={withReferral(photoUrl ?? 'https://unsplash.com')}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK}
      >
        Unsplash
      </a>
    </figcaption>
  );
}
