import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { IllustrationDictionary, IllustrationFlashcard, IllustrationStreak, IllustrationTrophy } from './Illustrations';
import { CEFRBadge } from './CEFRBadge';
import { SignInOptions } from './ProfilePage';
import { prefersReducedMotion } from '../lib/motion';

const FEATURES = [
  { Illus: IllustrationDictionary, title: 'AI-enriched dictionary', desc: 'Every German word comes with examples, images, audio, memory hooks, and level tags — all generated automatically.' },
  { Illus: IllustrationFlashcard, title: 'Spaced-repetition flashcards', desc: 'FSRS-powered scheduling surfaces cards at exactly the right moment so you review less and remember more.' },
  { Illus: IllustrationStreak, title: 'Progress you can see', desc: 'Streaks, a GitHub-style heatmap, and per-course stats keep you motivated on the journey from A1 to C2.' },
  { Illus: IllustrationTrophy, title: 'Feels native on mobile', desc: 'Install as a PWA. Swipe cards to rate, pull to refresh, study offline — it works like a native app, not a website.' },
];

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function LandingPage() {
  const container = useRef<HTMLDivElement>(null);
  
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const tl = gsap.timeline();
    
    // Animate the left side elements
    tl.from('.hero-element', {
      y: 40,
      opacity: 0,
      duration: 1,
      stagger: 0.15,
      ease: 'power3.out'
    });
    
    // Animate the features
    tl.from('.feature-card', {
      y: 30,
      opacity: 0,
      duration: 0.8,
      stagger: 0.1,
      ease: 'power2.out'
    }, '-=0.5');

    // Animate the right side auth panel
    tl.from('.auth-panel', {
      x: 50,
      opacity: 0,
      duration: 1,
      ease: 'power3.out'
    }, '-=1');
    
  }, { scope: container });

  return (
    <div ref={container} className="relative w-full min-h-[85vh] rounded-[2.5rem] border border-surface-800/60 bg-surface-900/60 shadow-2xl backdrop-blur-3xl overflow-hidden flex flex-col lg:flex-row">
      
      {/* Dynamic Morphing Mesh Background Gradients */}
      <div className="absolute inset-0 z-0 opacity-60 pointer-events-none mix-blend-screen overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-15%] left-[-15%] w-[70%] h-[70%] bg-gradient-to-br from-accent-indigo/40 via-indigo-600/30 to-purple-600/20 blur-[100px] animate-[morph-mesh_14s_ease-in-out_infinite] motion-reduce:animate-none" />
        <div className="absolute bottom-[-15%] right-[20%] w-[60%] h-[60%] bg-gradient-to-tl from-accent-emerald/30 via-teal-500/25 to-blue-500/20 blur-[120px] animate-[morph-mesh_18s_ease-in-out_infinite_reverse] motion-reduce:animate-none" />
      </div>

      {/* Left Side: Hero & Features */}
      <div className="relative z-10 flex-1 flex flex-col justify-center p-8 lg:p-16 lg:pr-12">
        <div className="max-w-3xl">
          <div className="hero-element flex items-center gap-6 mb-8">
            <picture>
              <source srcSet="/logo-dark.svg" type="image/svg+xml" />
              <img src="/logo.png" alt="Vocabahn" className="h-20 w-auto object-contain rounded-2xl shadow-xl hover:scale-105 transition-transform duration-500 motion-reduce:hover:scale-100" />
            </picture>
            <IllustrationDictionary className="h-16 w-auto text-accent-indigo drop-shadow-xl hover:scale-110 transition-transform duration-500 hidden sm:block motion-reduce:hover:scale-100" />
          </div>
          
          <h1 className="hero-element text-5xl font-black tracking-tighter sm:text-6xl lg:text-[5rem] lg:leading-[1.1] text-balance mb-6">
            Learn German, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-accent-indigo via-indigo-400 to-accent-emerald">word by word.</span>
          </h1>
          
          <p className="hero-element text-xl text-surface-300 max-w-xl font-medium leading-relaxed mb-8">
            Vocabahn is a free, open-source German vocabulary app with an AI-enriched dictionary and FSRS spaced-repetition flashcards.
          </p>

          {/* CEFR Level Badges */}
          <div className="hero-element flex flex-wrap items-center gap-3 mb-10">
            <span className="text-xs font-bold uppercase tracking-wider text-surface-400 mr-2">CEFR Levels:</span>
            {CEFR_LEVELS.map((level) => (
              <CEFRBadge key={level} level={level} size="sm" />
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ Illus, title, desc }) => (
              <div key={title} className="feature-card">
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

          {/* Hero Illustration with WebP / PNG fallback */}
          <div className="hero-element mt-12 w-full rounded-3xl overflow-hidden shadow-2xl border border-surface-700/50 relative">
            <picture>
              <source srcSet="/hero-bg.webp" type="image/webp" />
              <img src="/hero-bg.png" alt="Accelerate your language journey" className="w-full h-auto object-cover max-h-[300px]" />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-surface-900/90 to-transparent pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Right Side: Substantial Login Panel */}
      <div className="auth-panel relative z-20 w-full lg:w-[440px] shrink-0 border-t lg:border-t-0 lg:border-l border-surface-700/60 bg-gradient-to-b from-surface-900/95 via-surface-950/95 to-surface-950 backdrop-blur-3xl p-8 lg:p-12 flex flex-col justify-center shadow-2xl">
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-surface-900 shadow-xl border border-surface-700/60 overflow-hidden mb-5 group">
              <picture>
                <source srcSet="/icon-192.png" type="image/png" />
                <img src="/icon-192.png" alt="Vocabahn Logo" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              </picture>
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
