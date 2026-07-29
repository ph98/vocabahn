import { useState } from 'react';
import { CEFRBadge } from './CEFRBadge';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  HelpCircle,
  Layers,
  Sparkles,
  Zap,
  BarChart2,
  ChevronDown,
} from 'lucide-react';

interface AccordionItemProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionItem({ title, isOpen, onToggle, children }: AccordionItemProps) {
  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/60 overflow-hidden transition-colors hover:border-surface-700">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left font-semibold text-surface-100 transition-colors hover:bg-surface-800/40"
      >
        <span>{title}</span>
        <ChevronDown
          className={`size-5 text-surface-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`}
        />
      </button>
      {isOpen && <div className="border-t border-surface-800/60 p-5 text-sm text-surface-300 space-y-3 leading-relaxed">{children}</div>}
    </div>
  );
}

export function HelpPage() {
  const [openSection, setOpenSection] = useState<string | null>('cefr');

  const toggle = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <section aria-label="Help and User Guide" className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="text-center space-y-2 py-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-bold text-accent-indigo">
          <HelpCircle className="size-4" />
          Vocabahn Knowledge Base
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-surface-100 sm:text-4xl">
          User Guide & Learning Concepts
        </h1>
        <p className="text-sm text-surface-400 max-w-xl mx-auto">
          Understand CEFR levels, Spaced Repetition (FSRS), Knowledge states, and how Vocabahn optimizes your German fluency.
        </p>
      </div>

      <div className="space-y-4">
        {/* CEFR Framework */}
        <AccordionItem
          title="1. CEFR Framework & Sub-Levels Explained"
          isOpen={openSection === 'cefr'}
          onToggle={() => toggle('cefr')}
        >
          <div className="space-y-3">
            <p>
              Vocabahn organizes vocabulary into <strong>12 precise half sub-levels</strong> (<code>A1.1</code> through <code>C2.2</code>), following the Goethe-Institut and Profile Deutsch standards.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
              <div className="rounded-xl border border-surface-800 bg-surface-950/60 p-3 space-y-1">
                <CEFRBadge level="A1" size="sm" />
                <p className="text-xs font-semibold text-surface-200">A1.1 – A1.2 (500 – 1,000 words)</p>
                <p className="text-[11px] text-surface-400">Basic greetings, simple daily needs & introductions.</p>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-950/60 p-3 space-y-1">
                <CEFRBadge level="A2" size="sm" />
                <p className="text-xs font-semibold text-surface-200">A2.1 – A2.2 (1,000 – 2,000 words)</p>
                <p className="text-[11px] text-surface-400">Shopping, routine tasks, personal environment.</p>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-950/60 p-3 space-y-1">
                <CEFRBadge level="B1" size="sm" />
                <p className="text-xs font-semibold text-surface-200">B1.1 – B1.2 (2,000 – 4,000 words)</p>
                <p className="text-[11px] text-surface-400">Independent travel, work discussions & opinions.</p>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-950/60 p-3 space-y-1">
                <CEFRBadge level="B2" size="sm" />
                <p className="text-xs font-semibold text-surface-200">B2.1 – B2.2 (4,000 – 8,000 words)</p>
                <p className="text-[11px] text-surface-400">Complex technical texts & fluent native conversation.</p>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-950/60 p-3 space-y-1">
                <CEFRBadge level="C1" size="sm" />
                <p className="text-xs font-semibold text-surface-200">C1.1 – C1.2 (8,000 – 15,000 words)</p>
                <p className="text-[11px] text-surface-400">Spontaneous expression & structured complex writing.</p>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-950/60 p-3 space-y-1">
                <CEFRBadge level="C2" size="sm" />
                <p className="text-xs font-semibold text-surface-200">C2.1 – C2.2 (15,000+ words)</p>
                <p className="text-[11px] text-surface-400">Complete effortless mastery of German nuances.</p>
              </div>
            </div>
          </div>
        </AccordionItem>

        {/* FSRS Spaced Repetition */}
        <AccordionItem
          title="2. Spaced Repetition (FSRS) Demystified"
          isOpen={openSection === 'fsrs'}
          onToggle={() => toggle('fsrs')}
        >
          <div className="space-y-3">
            <p>
              Vocabahn utilizes the <strong>Free Spaced Repetition Scheduler (FSRS)</strong> algorithm, calculating optimal review intervals based on human memory decay curves.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-2">
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
                <p className="font-semibold text-indigo-300 text-xs">Stability (S)</p>
                <p className="text-xs text-surface-400 mt-1">Days required for retention probability to fall to 90%.</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="font-semibold text-amber-300 text-xs">Difficulty (D)</p>
                <p className="text-xs text-surface-400 mt-1">Intrinsic word difficulty scale (1 to 10) customized to you.</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="font-semibold text-emerald-300 text-xs">Retrievability (R)</p>
                <p className="text-xs text-surface-400 mt-1">Estimated real-time probability of recall right now.</p>
              </div>
            </div>
            <p className="font-medium text-surface-200 text-xs uppercase tracking-wider pt-1">Review Rating Buttons</p>
            <ul className="space-y-1.5 text-xs text-surface-300">
              <li><strong className="text-rose-400">Again (1):</strong> Total lapse / forgotten. Enters short-term relearning.</li>
              <li><strong className="text-amber-400">Hard (2):</strong> Remembered with effort. Slight interval increase.</li>
              <li><strong className="text-indigo-400">Good (3):</strong> Normal successful recall. Standard optimal interval step.</li>
              <li><strong className="text-emerald-400">Easy (4):</strong> Perfect instant recall. Significant stability increase.</li>
            </ul>
          </div>
        </AccordionItem>

        {/* Knowledge Ledger States */}
        <AccordionItem
          title="3. Knowledge States & Auto-Graduation"
          isOpen={openSection === 'knowledge'}
          onToggle={() => toggle('knowledge')}
        >
          <div className="space-y-3">
            <p>
              Your vocabulary progress is tracked through distinct knowledge states:
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2.5 rounded-xl border border-surface-800 bg-surface-950/40 p-3">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-surface-100">Evidenced Known</p>
                  <p className="text-surface-400">Proven through active review sessions with sustained high ratings over time.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-surface-800 bg-surface-950/40 p-3">
                <Zap className="size-4 shrink-0 text-indigo-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-surface-100">Assumed / Prior Known</p>
                  <p className="text-surface-400">Provisional high knowledge prior calculated from your calibrated CEFR frontier (skipping basic filler words).</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-surface-800 bg-surface-950/40 p-3">
                <Sparkles className="size-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-surface-100">Auto-Graduated</p>
                  <p className="text-surface-400">Automatically marked known when a card's calculated knowledge score crosses 85%.</p>
                </div>
              </div>
            </div>
          </div>
        </AccordionItem>

        {/* Study Modes */}
        <AccordionItem
          title="4. Study Modes & Practice Tools"
          isOpen={openSection === 'modes'}
          onToggle={() => toggle('modes')}
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-surface-800 bg-surface-950/50 p-3.5 space-y-1">
                <BookOpen className="size-4 text-indigo-400" />
                <p className="font-semibold text-surface-200 text-sm">Flashcard Review</p>
                <p className="text-surface-400">Dual-sided interactive cards with native audio, definitions, and AI context sentences.</p>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-950/50 p-3.5 space-y-1">
                <Brain className="size-4 text-amber-400" />
                <p className="font-semibold text-surface-200 text-sm">Active Production</p>
                <p className="text-surface-400">Spelling & writing exercises forcing active recall rather than passive recognition.</p>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-950/50 p-3.5 space-y-1">
                <Layers className="size-4 text-emerald-400" />
                <p className="font-semibold text-surface-200 text-sm">Decks & CEFR Courses</p>
                <p className="text-surface-400">Structured level-by-level courses and user-created custom decks for targeted learning.</p>
              </div>
            </div>
          </div>
        </AccordionItem>

        {/* Progress & Glossary */}
        <AccordionItem
          title="5. Statistics & Progress Glossary"
          isOpen={openSection === 'glossary'}
          onToggle={() => toggle('glossary')}
        >
          <div className="space-y-3 text-xs text-surface-300">
            <div className="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-950/40 p-3">
              <BarChart2 className="size-5 shrink-0 text-indigo-400" />
              <div>
                <p className="font-semibold text-surface-100">Day Streak</p>
                <p className="text-surface-400">Count of consecutive calendar days (UTC) where you completed at least 1 review session.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-950/40 p-3">
              <Sparkles className="size-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-surface-100">Estimated Vocabulary Size</p>
                <p className="text-surface-400">Calculated sum of active known words plus statistical estimates across your CEFR level frontier.</p>
              </div>
            </div>
          </div>
        </AccordionItem>
      </div>
    </section>
  );
}
