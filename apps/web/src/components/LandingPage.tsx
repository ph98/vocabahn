import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { IllustrationDictionary, IllustrationFlashcard, IllustrationStreak, IllustrationTrophy } from './Illustrations';
import { SignInOptions } from './ProfilePage';

const FEATURES = [
  { Illus: IllustrationDictionary, title: 'AI-enriched dictionary', desc: 'Every German word comes with examples, images, audio, memory hooks, and level tags — all generated automatically.' },
  { Illus: IllustrationFlashcard, title: 'Spaced-repetition flashcards', desc: 'FSRS-powered scheduling surfaces cards at exactly the right moment so you review less and remember more.' },
  { Illus: IllustrationStreak, title: 'Progress you can see', desc: 'Streaks, a GitHub-style heatmap, and per-course stats keep you motivated on the journey from A1 to C1.' },
  { Illus: IllustrationTrophy, title: 'Feels native on mobile', desc: 'Install as a PWA. Swipe cards to rate, pull to refresh, study offline — it works like a native app, not a website.' },
];

export function LandingPage() {
  const container = useRef<HTMLDivElement>(null);
  
  useGSAP(() => {
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
      
      {/* Dynamic Background Gradients */}
      <div className="absolute inset-0 z-0 opacity-50 pointer-events-none mix-blend-screen overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-accent-indigo/30 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[30%] w-[50%] h-[50%] rounded-full bg-accent-emerald/20 blur-[140px] animate-[pulse_10s_ease-in-out_infinite]" style={{ animationDelay: '2s' }} />
      </div>

      {/* Left Side: Hero & Features */}
      <div className="relative z-10 flex-1 flex flex-col justify-center p-8 lg:p-16 lg:pr-12">
        <div className="max-w-3xl">
          <div className="hero-element flex items-center gap-6 mb-8">
            <img src="/logo.png" alt="Vocabahn" className="h-20 w-auto object-contain rounded-2xl shadow-xl hover:scale-105 transition-transform duration-500" />
            <IllustrationDictionary className="h-16 w-auto text-accent-indigo drop-shadow-xl hover:scale-110 transition-transform duration-500 hidden sm:block" />
          </div>
          
          <h1 className="hero-element text-5xl font-black tracking-tighter sm:text-6xl lg:text-[5rem] lg:leading-[1.1] text-balance mb-6">
            Learn German, <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-accent-indigo via-indigo-400 to-accent-emerald">word by word.</span>
          </h1>
          
          <p className="hero-element text-xl text-surface-300 max-w-xl font-medium leading-relaxed mb-12">
            Vocabahn is a free, open-source German vocabulary app with an AI-enriched dictionary and FSRS spaced-repetition flashcards.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ Illus, title, desc }) => (
              <div key={title} className="feature-card">
                <div
                  className="group relative h-full overflow-hidden rounded-[1.5rem] border border-surface-700/50 bg-surface-800/30 p-6 backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:border-accent-indigo/50 hover:bg-surface-800/60 hover:shadow-premium"
                >
                  <Illus className="mb-5 h-12 w-auto text-accent-indigo transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3" />
                  <h3 className="mb-2 text-lg font-bold text-surface-100">{title}</h3>
                  <p className="text-sm text-surface-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="hero-element mt-12 w-full rounded-3xl overflow-hidden shadow-2xl border border-surface-700/50 relative">
            <img src="/hero-bg.png" alt="Accelerate your language journey" className="w-full h-auto object-cover max-h-[300px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-900/90 to-transparent pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Right Side: Login Panel */}
      <div className="auth-panel relative z-20 w-full lg:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-surface-800/50 bg-surface-950/80 backdrop-blur-2xl p-8 lg:p-12 flex flex-col justify-center">
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-surface-900 shadow-md border border-surface-700/50 overflow-hidden mb-6">
              <img src="/icon-192.png" alt="Vocabahn Logo" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Join Vocabahn</h2>
            <p className="mt-2 text-surface-400 text-sm">Start your German learning journey today</p>
          </div>
          
          <SignInOptions />
          
          <p className="mt-8 text-center text-xs text-surface-500 leading-relaxed">
            By signing in, you agree to our <a href="#" className="underline hover:text-surface-300">Terms of Service</a> and <a href="#" className="underline hover:text-surface-300">Privacy Policy</a>.
          </p>
        </div>
      </div>

    </div>
  );
}
