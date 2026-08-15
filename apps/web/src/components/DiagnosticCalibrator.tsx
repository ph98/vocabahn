import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { fetchDiagnosticProbe, calibrateDiagnostic } from '../api';
import { CEFRBadge } from './CEFRBadge';
import { useToast } from './Toast';
import { trackEvent } from '../lib/telemetry';
import {
  Sparkles,
  Check,
  X,
  Eye,
  Award,
  RotateCcw,
  BookOpen,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  List,
} from 'lucide-react';
import type {
  CalibrateDiagnosticResponse,
  DiagnosticProbeAnswer,
} from '@vocabahn/shared';


interface DiagnosticCalibratorProps {
  onComplete?: (result: CalibrateDiagnosticResponse) => void;
  onCancel?: () => void;
}

export function DiagnosticCalibrator({ onComplete, onCancel }: DiagnosticCalibratorProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: probeItems, isPending, isError, refetch } = useQuery({
    queryKey: ['diagnostic-probe'],
    queryFn: fetchDiagnosticProbe,
    staleTime: 1000 * 60 * 10,
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<DiagnosticProbeAnswer[]>([]);
  const [showPeek, setShowPeek] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [calibrationResult, setCalibrationResult] = useState<CalibrateDiagnosticResponse | null>(null);
  const [showAllGraduated, setShowAllGraduated] = useState(false);

  const calibrateMutation = useMutation({
    mutationFn: calibrateDiagnostic,
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data.user);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['known-words'] });
      void queryClient.invalidateQueries({ queryKey: ['known-words-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['due-cards'] });
      void queryClient.invalidateQueries({ queryKey: ['courses'] });

      trackEvent('cefr_level_calibrate', {
        cefr_level: data.estimatedCefrLevel,
      });

      toast.success(`German level calibrated to ${data.estimatedCefrLevel}`, {
        description: `Estimated ~${data.estimatedVocabSize.toLocaleString()} words mastered (${data.graduatedCount} lower-level words marked known).`,
      });

      setCalibrationResult(data);
      if (onComplete) onComplete(data);
    },
    onError: () => {
      toast.error("Couldn't process calibration", {
        description: 'Please check your connection and try again.',
      });
    },
  });

  // Reset answer timer when current question changes
  useEffect(() => {
    setStartTime(Date.now());
    setShowPeek(false);
  }, [currentIndex]);

  const handleAnswer = useCallback(
    (known: boolean) => {
      if (!probeItems || currentIndex >= probeItems.length) return;

      const currentItem = probeItems[currentIndex];
      if (!currentItem) return;
      const latencyMs = Math.max(0, Date.now() - startTime);

      const answer: DiagnosticProbeAnswer = {
        id: currentItem.id,
        word: currentItem.word,
        isReal: currentItem.isReal,
        known,
        latencyMs,
      };

      const updatedAnswers = [...answers, answer];
      setAnswers(updatedAnswers);

      if (currentIndex + 1 < probeItems.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // Complete probe and submit

        calibrateMutation.mutate({ answers: updatedAnswers });
      }
    },
    [probeItems, currentIndex, startTime, answers, calibrateMutation],
  );

  // Keyboard navigation: Left = Don't Know, Right = Know It, Space = Peek, Esc = Cancel
  useEffect(() => {
    if (calibrationResult || !probeItems || currentIndex >= probeItems.length) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'KeyK' || e.key === '1') {
        e.preventDefault();
        handleAnswer(true);
      } else if (e.key === 'ArrowLeft' || e.key === 'KeyJ' || e.key === '2') {
        e.preventDefault();
        handleAnswer(false);
      } else if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        setShowPeek((prev) => !prev);
      } else if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [calibrationResult, probeItems, currentIndex, handleAnswer, onCancel]);

  const restartDiagnostic = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setShowPeek(false);
    setCalibrationResult(null);
    setShowAllGraduated(false);
    void refetch();
  };

  // ── Results Screen ──────────────────────────────────────────────────────────
  if (calibrationResult) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/40 bg-gradient-to-br from-surface-900 via-indigo-950/30 to-surface-950 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-indigo-500/10 blur-3xl" />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-800 pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="size-3.5" />
              Calibration Complete
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-surface-50">Your Calibrated German Profile</h3>
          </div>
          <div className="flex items-center gap-2">
            <CEFRBadge level={calibrationResult.estimatedCefrLevel} size="md" className="text-base px-3.5 py-1" />
          </div>
        </div>

        {/* Highlight Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="rounded-2xl border border-surface-800 bg-surface-900/80 p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-surface-400 text-xs font-medium">
              <TrendingUp className="size-4 text-indigo-400" />
              Estimated Vocabulary
            </div>
            <p className="text-2xl font-bold text-surface-50">
              ~{calibrationResult.estimatedVocabSize.toLocaleString()} <span className="text-xs font-normal text-surface-400">words</span>
            </p>
            <p className="text-[11px] text-surface-400">Based on standard German frequency ceilings</p>
          </div>

          <div className="rounded-2xl border border-surface-800 bg-surface-900/80 p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-surface-400 text-xs font-medium">
              <Award className="size-4 text-emerald-400" />
              Auto-Graduated Base
            </div>
            <p className="text-2xl font-bold text-emerald-300">
              {calibrationResult.graduatedCount} <span className="text-xs font-normal text-surface-400">words marked</span>
            </p>
            <p className="text-[11px] text-surface-400">Skipped from daily reviews so you don't repeat what you know</p>
          </div>

          <div className="rounded-2xl border border-surface-800 bg-surface-900/80 p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-surface-400 text-xs font-medium">
              <Sparkles className="size-4 text-amber-400" />
              Signal Confidence
            </div>
            <p className="text-2xl font-bold text-amber-300">
              {Math.round(calibrationResult.confidenceScore * 100)}%
            </p>
            <p className="text-[11px] text-surface-400">Validated with authentic LexTALE control checks</p>
          </div>
        </div>

        {/* 12 Sub-Level Breakdown Matrix */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-400">CEFR 12-Sublevel Mastery Matrix</h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {calibrationResult.breakdown.map((b) => {
              const isEstimated = b.cefrLevel === calibrationResult.estimatedCefrLevel;
              return (
                <div
                  key={b.cefrLevel}
                  className={`rounded-xl border p-2.5 text-center transition-all ${
                    isEstimated
                      ? 'border-indigo-400 bg-indigo-500/20 ring-2 ring-indigo-500/40 shadow-lg'
                      : b.status === 'MASTERED'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                      : b.status === 'FRONTIER'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : 'border-surface-800 bg-surface-900/40 text-surface-400'
                  }`}
                >
                  <p className="font-mono font-bold text-xs">{b.cefrLevel}</p>
                  <p className="text-[10px] mt-0.5 opacity-80">
                    {b.status === 'MASTERED' ? 'Mastered' : b.status === 'FRONTIER' ? 'Frontier' : 'Learning'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sample Frontier Words */}
        {calibrationResult.frontierWords && calibrationResult.frontierWords.length > 0 && (
          <div className="space-y-3 rounded-2xl border border-surface-800 bg-surface-950/60 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-300 flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-indigo-400" />
                Target Frontier Words at {calibrationResult.estimatedCefrLevel}
              </h4>
              <span className="text-[11px] text-surface-400">Ready for your upcoming lessons</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {calibrationResult.frontierWords.map((fw) => (
                <div
                  key={fw.id}
                  className="inline-flex items-center gap-2 rounded-xl border border-surface-700 bg-surface-900 px-3 py-1.5 text-xs font-medium text-surface-200"
                >
                  {fw.emoji && <span>{fw.emoji}</span>}
                  <span lang="de" className="font-bold text-surface-100">{fw.word}</span>
                  {fw.translation && <span className="text-surface-400 text-[11px] max-w-32 truncate">— {fw.translation}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-Graduated Words Sample */}
        {calibrationResult.graduatedWords && calibrationResult.graduatedWords.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAllGraduated(!showAllGraduated)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <List className="size-3.5" />
              {showAllGraduated ? 'Hide graduated words sample' : `View sample of ${calibrationResult.graduatedCount} auto-graduated words`}
            </button>

            {showAllGraduated && (
              <div className="max-h-40 overflow-y-auto rounded-2xl border border-surface-800 bg-surface-950/80 p-3 text-xs">
                <p className="text-surface-400 mb-2">
                  These lower-level words were marked as known and scheduled 365 days out. You can undo any word anytime in the "Your Known Words" tab.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {calibrationResult.graduatedWords.map((word, i) => (
                    <span key={i} className="rounded-lg bg-surface-800 px-2 py-0.5 text-surface-200 font-mono text-[11px]" lang="de">
                      {word}
                    </span>
                  ))}
                  {calibrationResult.graduatedCount > calibrationResult.graduatedWords.length && (
                    <span className="text-surface-400 text-[11px] self-center">
                      +{calibrationResult.graduatedCount - calibrationResult.graduatedWords.length} more…
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-surface-800">
          <button
            type="button"
            onClick={restartDiagnostic}
            className="inline-flex items-center gap-1.5 rounded-xl border border-surface-700 px-4 py-2.5 text-xs font-semibold text-surface-300 hover:bg-surface-800 transition-colors"
          >
            <RotateCcw className="size-3.5" />
            Re-test Diagnostic
          </button>
          
          <button
            type="button"
            onClick={() => {
              if (onCancel) onCancel();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-500 hover:to-indigo-400 active:scale-95 transition-all"
          >
            Done & Continue
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Loading & Error States ──────────────────────────────────────────────────
  if (isPending) {
    return (
      <div className="rounded-3xl border border-surface-800 bg-surface-900/90 p-8 text-center space-y-3">
        <div className="size-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-surface-300">Preparing calibrated German vocabulary probes…</p>
      </div>
    );
  }

  if (isError || !probeItems || probeItems.length === 0) {
    return (
      <div className="rounded-3xl border border-accent-red/30 bg-surface-900/90 p-8 text-center space-y-4">
        <p className="text-sm text-accent-red">Couldn't load diagnostic probes.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-xl bg-surface-800 px-4 py-2 text-xs font-semibold text-surface-100 hover:bg-surface-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const currentItem = probeItems[currentIndex];
  if (!currentItem) {
    return null;
  }
  const progressPercent = Math.round((currentIndex / probeItems.length) * 100);

  // ── Active Interactive Probe Card ───────────────────────────────────────────
  return (
    <div className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-surface-900/95 via-indigo-950/20 to-surface-950/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">

      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-32 size-80 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Progress & Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-indigo-300">2-Minute Diagnostic Calibrator</span>
          <span className="font-mono text-surface-400">
            {currentIndex + 1} / {probeItems.length}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question Card Body */}
      <div className="flex flex-col items-center justify-center py-6 sm:py-10 text-center space-y-4">
        <span className="text-xs uppercase tracking-widest text-surface-400 font-medium">
          Do you know this German word?
        </span>

        <h2
          lang="de"
          className="text-4xl sm:text-5xl font-black tracking-tight text-surface-50 drop-shadow-sm select-none"
        >
          {currentItem.word}
        </h2>

        {/* Translation / Hint Peek */}
        <div className="min-h-8">
          {showPeek ? (
            <p className="text-sm font-medium text-indigo-300 animate-fadeIn">
              {currentItem.translation ? currentItem.translation : '— (No translation)'}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setShowPeek(true)}
              className="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200 transition-colors"
            >
              <Eye className="size-3" />
              Peek translation
            </button>
          )}
        </div>
      </div>

      {/* Response Action Buttons */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md mx-auto">
        <button
          type="button"
          disabled={calibrateMutation.isPending}
          onClick={() => handleAnswer(false)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-surface-700 bg-surface-900/80 px-4 py-3 text-sm font-bold text-surface-300 hover:border-surface-600 hover:bg-surface-800 hover:text-surface-100 active:scale-[0.97] transition-all"
        >
          <X className="size-4 text-surface-400" />
          <span>Don't know</span>
          <span className="hidden sm:inline text-[10px] text-surface-500 font-mono ml-1">(←)</span>
        </button>

        <button
          type="button"
          disabled={calibrateMutation.isPending}
          onClick={() => handleAnswer(true)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.97] transition-all"
        >
          <Check className="size-4" />
          <span>Know it</span>
          <span className="hidden sm:inline text-[10px] text-emerald-200 font-mono ml-1">(→)</span>
        </button>
      </div>

      {/* Footer Instructions & Cancel */}
      <div className="flex items-center justify-between text-xs text-surface-500 pt-2 border-t border-surface-800/80">
        <div className="flex items-center gap-2">
          <span>Shortcuts:</span>
          <kbd className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-mono text-surface-300">←</kbd>
          <kbd className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-mono text-surface-300">→</kbd>
          <kbd className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-mono text-surface-300">Space</kbd>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-surface-400 hover:text-surface-200 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
