import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Scale, Shield, Sparkles, UserCheck } from 'lucide-react';

export function TermsPage() {
  return (
    <article className="w-full max-w-4xl mx-auto py-6 px-4 sm:px-6">
      {/* Navigation Header */}
      <div className="mb-8 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800/60 hover:bg-surface-800 text-surface-200 text-sm font-medium transition-colors border border-surface-700/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Back to Vocabahn</span>
        </Link>
        <span className="text-xs text-surface-400 font-mono">Last updated: July 2026</span>
      </div>

      {/* Main Glassmorphic Card */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-surface-800/80 bg-surface-900/80 p-8 md:p-12 shadow-2xl backdrop-blur-2xl">
        {/* Background Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-indigo/10 rounded-full blur-[120px] pointer-events-none" aria-hidden="true" />

        {/* Hero Section */}
        <header className="mb-10 pb-8 border-b border-surface-800/80">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-indigo-500/10 text-accent-indigo border border-indigo-500/20 mb-4">
            <FileText className="size-8" aria-hidden="true" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-surface-100">
            Terms of Service
          </h1>
          <p className="mt-3 text-base md:text-lg text-surface-300 max-w-2xl leading-relaxed">
            Welcome to Vocabahn. By using our application, websites, and services, you agree to comply with and be bound by the following terms.
          </p>
        </header>

        {/* Content Sections */}
        <div className="space-y-10 text-surface-300 leading-relaxed text-sm md:text-base">
          {/* Section 1 */}
          <section aria-labelledby="section-acceptance">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <UserCheck className="size-5 text-accent-indigo shrink-0" aria-hidden="true" />
              <h2 id="section-acceptance">1. Acceptance of Terms</h2>
            </div>
            <p>
              By accessing or using Vocabahn, creating an account, or interacting with our vocabulary learning features, you agree to these Terms of Service. If you do not agree to these terms, please do not use the service.
            </p>
          </section>

          {/* Section 2 */}
          <section aria-labelledby="section-account">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Shield className="size-5 text-accent-emerald shrink-0" aria-hidden="true" />
              <h2 id="section-account">2. Account Registration & Authentication</h2>
            </div>
            <p className="mb-3">
              Vocabahn provides authentication via Google OAuth and email magic links. You are responsible for:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-surface-400">
              <li>Maintaining the security of your email account and login credentials.</li>
              <li>Ensuring the accuracy of information provided during sign-in.</li>
              <li>Promptly notifying us if you suspect any unauthorized access to your account.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section aria-labelledby="section-permitted-use">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Scale className="size-5 text-accent-amber shrink-0" aria-hidden="true" />
              <h2 id="section-permitted-use">3. Permitted Use & Conduct</h2>
            </div>
            <p className="mb-3">
              Vocabahn is designed for personal, educational, and self-study purposes in German language learning. You agree not to:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-surface-400">
              <li>Abuse, disrupt, or attempt to compromise API endpoints or database infrastructure.</li>
              <li>Exceed or bypass automated rate limits or daily AI enrichment quotas.</li>
              <li>Use automated scripts or scrapers to extract application data outside provided interfaces.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section aria-labelledby="section-ai-services">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Sparkles className="size-5 text-accent-indigo shrink-0" aria-hidden="true" />
              <h2 id="section-ai-services">4. AI-Enriched Content & Third-Party Providers</h2>
            </div>
            <p className="mb-3">
              Vocabahn incorporates automated AI services to enhance learning materials:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-surface-400">
              <li><strong>Dictionary Definitions & Mnemonics:</strong> Generated using Google Gemini AI for pedagogical guidance.</li>
              <li><strong>Audio Pronunciations:</strong> Synthesized via ElevenLabs and Google Text-to-Speech fallback.</li>
              <li><strong>Visual Aids:</strong> Contextual images retrieved via the Unsplash API.</li>
            </ul>
            <p className="mt-3">
              While we strive for linguistic precision, AI-generated content is provided for educational convenience "as is" without guarantees of flawless grammatical completeness.
            </p>
          </section>

          {/* Section 5 */}
          <section aria-labelledby="section-disclaimer">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <Scale className="size-5 text-surface-400 shrink-0" aria-hidden="true" />
              <h2 id="section-disclaimer">5. Limitation of Liability</h2>
            </div>
            <p>
              Vocabahn is provided on an "AS IS" and "AS AVAILABLE" basis. To the maximum extent permitted by applicable law, Vocabahn and its contributors shall not be liable for any indirect, incidental, or consequential damages resulting from your use of or inability to use the service.
            </p>
          </section>

          {/* Section 6 */}
          <section aria-labelledby="section-contact">
            <div className="flex items-center gap-3 mb-3 text-surface-100 font-bold text-lg">
              <FileText className="size-5 text-accent-emerald shrink-0" aria-hidden="true" />
              <h2 id="section-contact">6. Contact & Questions</h2>
            </div>
            <p>
              If you have any questions regarding these Terms of Service, please open an issue or pull request on our official open-source GitHub repository at{' '}
              <a
                href="https://github.com/ph98/vocabahn"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-indigo hover:underline font-medium"
              >
                github.com/ph98/vocabahn
              </a>.
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
