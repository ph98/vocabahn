import { Link } from 'react-router-dom';
import { IllustrationDictionary, IllustrationFlashcard, IllustrationStreak, IllustrationTrophy } from './Illustrations';
import { CEFRBadge } from './CEFRBadge';
import { SignInOptions } from './SignInOptions';

/**
 * Stagger step for the intro, in milliseconds.
 *
 * The intro is CSS (`.vb-rise-in` in `index.css`), not GSAP. It used to be a
 * `gsap.timeline()`, which meant the hero `<h1>` — the LCP element — sat at
 * `opacity: 0` until ~230 kB of animation library had downloaded, parsed and
 * run. In CSS it starts at first paint, so the only thing between paint and
 * LCP is this delay, which is why the headline is one step in rather than four.
 */
const STEP_MS = 60;

/** Inline stagger delay for the nth element of the intro. */
const step = (n: number) => ({ '--vb-delay': `${n * STEP_MS}ms` }) as React.CSSProperties;

const FEATURES = [
  { Illus: IllustrationDictionary, title: 'AI-enriched dictionary', desc: 'Every German word comes with examples, images, audio, memory hooks, and level tags — all generated automatically.' },
  { Illus: IllustrationFlashcard, title: 'Spaced-repetition flashcards', desc: 'FSRS-powered scheduling surfaces cards at exactly the right moment so you review less and remember more.' },
  { Illus: IllustrationStreak, title: 'Progress you can see', desc: 'Streaks, a GitHub-style heatmap, and per-course stats keep you motivated on the journey from A1 to C2.' },
  { Illus: IllustrationTrophy, title: 'Feels native on mobile', desc: 'Install as a PWA. Swipe cards to rate, pull to refresh, study offline — it works like a native app, not a website.' },
];

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function LandingPage() {
  return (
    <div className="relative w-full min-h-[85vh] rounded-[2.5rem] border border-surface-800/60 bg-surface-900/60 shadow-2xl backdrop-blur-3xl overflow-hidden flex flex-col lg:flex-row">
      
      {/* Dynamic Morphing Mesh Background Gradients */}
      <div className="absolute inset-0 z-0 opacity-60 pointer-events-none mix-blend-screen overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-15%] left-[-15%] w-[70%] h-[70%] bg-gradient-to-br from-accent-indigo/40 via-indigo-600/30 to-purple-600/20 blur-[100px] animate-[morph-mesh_14s_ease-in-out_infinite] motion-reduce:animate-none" />
        <div className="absolute bottom-[-15%] right-[20%] w-[60%] h-[60%] bg-gradient-to-tl from-accent-emerald/30 via-teal-500/25 to-blue-500/20 blur-[120px] animate-[morph-mesh_18s_ease-in-out_infinite_reverse] motion-reduce:animate-none" />
      </div>

      {/* Left Side: Hero & Features */}
      <div className="relative z-10 flex-1 flex flex-col justify-center p-8 lg:p-16 lg:pr-12">
        <div className="max-w-3xl">
          <div className="vb-rise-in flex items-center gap-6 mb-8">
            <picture>
              <source srcSet="/logo-dark.svg" type="image/svg+xml" />
              {/* Intrinsic size from the file (800×240) so the row reserves its
                  height before the image lands and nothing below it jumps. */}
              <img src="/logo.png" alt="Vocabahn" width={800} height={240} className="h-20 w-auto object-contain rounded-2xl shadow-xl hover:scale-105 transition-transform duration-500 motion-reduce:hover:scale-100" />
            </picture>
            <IllustrationDictionary className="h-16 w-auto text-accent-indigo drop-shadow-xl hover:scale-110 transition-transform duration-500 hidden sm:block motion-reduce:hover:scale-100" />
          </div>

          {/* Deliberately not animated. This headline is the LCP element, and
              an element that fades in does not count as painted until the fade
              finishes — measured, the entrance was pushing LCP out by the
              animation's full 560 ms for no other reason. It is now on screen
              in the first frame while everything around it rises in, which is
              both faster and a perfectly ordinary way for an intro to read. */}
          <h1 className="text-5xl font-black tracking-tighter sm:text-6xl lg:text-[5rem] lg:leading-[1.1] text-balance mb-6">
            Learn German, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-accent-indigo via-indigo-400 to-accent-emerald">word by word.</span>
          </h1>

          <p style={step(2)} className="vb-rise-in text-xl text-surface-300 max-w-xl font-medium leading-relaxed mb-8">
            Vocabahn is a free, open-source German vocabulary app with an AI-enriched dictionary and FSRS spaced-repetition flashcards.
          </p>

          {/* CEFR Level Badges */}
          <div style={step(3)} className="vb-rise-in flex flex-wrap items-center gap-3 mb-10">
            <span className="text-xs font-bold uppercase tracking-wider text-surface-400 mr-2">CEFR Levels:</span>
            {CEFR_LEVELS.map((level) => (
              <CEFRBadge key={level} level={level} size="sm" />
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ Illus, title, desc }, i) => (
              <div key={title} style={step(4 + i)} className="vb-rise-in">
                <div
                  className="group relative h-full overflow-hidden rounded-[1.5rem] border border-surface-700/50 bg-surface-800/30 p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02] hover:border-accent-indigo/60 hover:bg-surface-800/70 hover:shadow-[0_16px_40px_rgba(56,189,248,0.2)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
                >
                  <div className="absolute -inset-px rounded-[1.5rem] bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-emerald-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />
                  <Illus className="mb-5 h-12 w-auto text-accent-indigo transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3 motion-reduce:group-hover:scale-100 motion-reduce:group-hover:rotate-0" />
                  <h2 className="mb-2 text-lg font-bold text-surface-100">{title}</h2>
                  <p className="text-sm text-surface-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Hero Illustration with WebP / PNG fallback.
              Not the LCP element and not above the fold at any width — it sits
              below four feature cards — but it was still fetched eagerly, so
              ~100 kB of webp competed for bandwidth with the app's own assets
              during exactly the window LCP is measured over. Deferring it is
              worth more here than any priority hint would be. Intrinsic size is
              the file's own 1000×600, so the box is reserved before it lands. */}
          <div className="vb-rise-in mt-12 w-full rounded-3xl overflow-hidden shadow-2xl border border-surface-700/50 relative">
            <picture>
              <source srcSet="/hero-bg.webp" type="image/webp" />
              <img
                src="/hero-bg.png"
                alt="Accelerate your language journey"
                width={1000}
                height={600}
                loading="lazy"
                decoding="async"
                // `loading="lazy"` alone does not reliably hold this back:
                // Chrome's lazy-load threshold is generous, and the image sits
                // just inside it. The priority hint is what actually moves it
                // behind the assets first paint depends on.
                fetchPriority="low"
                className="w-full h-auto object-cover max-h-[300px]"
              />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-surface-900/90 to-transparent pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Right Side: Substantial Login Panel */}
      <div className="vb-fade-in relative z-20 w-full lg:w-[440px] shrink-0 border-t lg:border-t-0 lg:border-l border-surface-700/60 bg-gradient-to-b from-surface-900/95 via-surface-950/95 to-surface-950 backdrop-blur-3xl p-8 lg:p-12 flex flex-col justify-center shadow-2xl">
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-surface-900 shadow-xl border border-surface-700/60 overflow-hidden mb-5 group">
              {/* A 26 kB PNG rendered into a 64 px box. The `<picture>` wrapper
                  offered no alternative format — the `<source>` was the same
                  file — so it is gone, and the icon is decoded off the critical
                  path: on mobile this panel is below the whole hero. */}
              <img
                src="/icon-192.png"
                alt="Vocabahn Logo"
                width={192}
                height={192}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">Join Vocabahn</h2>
            <p className="mt-2 text-surface-400 text-sm">Start your German learning journey today</p>
          </div>
          
          <SignInOptions />
          
          <p className="mt-8 text-center text-xs text-surface-500 leading-relaxed">
            By signing in, you agree to our{' '}
            <Link to="/terms" className="underline hover:text-surface-300 font-medium transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline hover:text-surface-300 font-medium transition-colors">
              Privacy Policy
            </Link>.
          </p>
        </div>
      </div>

    </div>
  );
}
