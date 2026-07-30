import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { updateCefrLevel } from '../api';
import { CEFRBadge } from './CEFRBadge';
import { MAIN_CEFR_LEVELS, CEFR_LEVELS, type MainCefrLevel, type AutoGraduation, type User } from '@vocabahn/shared';
import { trackEvent } from '../lib/telemetry';
import { Sparkles, Check, ChevronDown, ChevronUp, Compass, Award } from 'lucide-react';

const LEVEL_DESCRIPTIONS: Record<MainCefrLevel, { title: string; desc: string; color: string }> = {
  A1: { title: 'Beginner', desc: 'Basic phrases & everyday expressions', color: 'from-sky-500/20 to-sky-600/10 border-sky-500/30 text-sky-300' },
  A2: { title: 'Elementary', desc: 'Routine conversations & familiar topics', color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-300' },
  B1: { title: 'Intermediate', desc: 'Main ideas on work, school & travel', color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-300' },
  B2: { title: 'Upper Intermediate', desc: 'Complex texts & technical discussions', color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-300' },
  C1: { title: 'Advanced', desc: 'Fluent, spontaneous & flexible language use', color: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-300' },
  C2: { title: 'Mastery', desc: 'Near-native comprehension & expression', color: 'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-300' },
};

interface CEFRCalibrationProps {
  user: User;
  onDismiss?: () => void;
  compact?: boolean;
}

export function CEFRCalibrationCard({ user, onDismiss, compact = false }: CEFRCalibrationProps) {
  const queryClient = useQueryClient();
  const [selectedMain, setSelectedMain] = useState<MainCefrLevel>('B1');
  const [selectedSubLevel, setSelectedSubLevel] = useState<string>('B1.1');
  const [showAdvancedSublevels, setShowAdvancedSublevels] = useState(false);
  const [graduationInfo, setGraduationInfo] = useState<AutoGraduation | null>(null);

  const mutation = useMutation({
    mutationFn: (level: string) => {
      trackEvent('cefr_level_calibrate', { level });
      return updateCefrLevel(level);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data.user);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['due-cards'] });
      queryClient.invalidateQueries({ queryKey: ['known-words'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      setGraduationInfo(data.graduation);
    },
  });

  const handleMainSelect = (main: MainCefrLevel) => {
    setSelectedMain(main);
    setSelectedSubLevel(`${main}.1`);
  };

  const handleSave = () => {
    const levelToSave = showAdvancedSublevels ? selectedSubLevel : `${selectedMain}.1`;
    mutation.mutate(levelToSave);
  };

  if (graduationInfo) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 via-surface-900/90 to-surface-950/90 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
            <Award className="size-6" />
          </div>
          <h3 className="text-xl font-bold text-surface-100">German Level Calibrated!</h3>
          <p className="text-sm text-surface-300 max-w-md">
            Your level is now set to <CEFRBadge level={user.cefrLevel || selectedSubLevel} size="sm" className="ml-1" />.
          </p>
          {graduationInfo.count > 0 ? (
            <p className="text-xs text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 mt-1">
              ✨ Auto-marked <span className="font-bold text-white">{graduationInfo.count}</span> lower-level filler words as known so you skip what you already master!
            </p>
          ) : (
            <p className="text-xs text-surface-400">
              New-card introduced slots will now prioritize unknown words matching your level.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setGraduationInfo(null);
              if (onDismiss) onDismiss();
            }}
            className="mt-2 rounded-xl bg-surface-800 px-5 py-2.5 text-xs font-semibold text-surface-100 transition-colors hover:bg-surface-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-surface-900/95 via-indigo-950/20 to-surface-950/95 shadow-2xl backdrop-blur-xl ${compact ? 'p-5' : 'p-6 sm:p-7'}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-indigo-500/10 blur-3xl" />
      
      <div className="relative z-10 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-300">
              <Compass aria-hidden className="size-3.5" />
              Initial Calibration
            </div>
            <h3 className="text-xl font-bold tracking-tight text-surface-100">
              {user.cefrLevel ? 'Re-calibrate Your German Level' : 'Set Your German CEFR Level'}
            </h3>
            <p className="text-xs text-surface-400">
              Calibrating seeds your knowledge prior score so card introduction ordering & graduation adapt to you immediately.
            </p>
          </div>
          {user.cefrLevel && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-surface-400">Current:</span>
              <CEFRBadge level={user.cefrLevel} size="sm" />
            </div>
          )}
        </div>

        {/* Level Choice Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MAIN_CEFR_LEVELS.map((main) => {
            const info = LEVEL_DESCRIPTIONS[main];
            return (
              <button
                key={main}
                type="button"
                onClick={() => handleMainSelect(main)}
                className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-all duration-200 ${
                  selectedMain === main
                    ? 'border-indigo-500/60 bg-indigo-500/15 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-surface-800 bg-surface-900/60 hover:border-surface-700 hover:bg-surface-850'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <CEFRBadge level={main} size="sm" />
                  {selectedMain === main && <Check className="size-4 text-indigo-400" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-surface-100">{info.title}</p>
                  <p className="line-clamp-2 text-[11px] leading-tight text-surface-400">{info.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Toggle fine sub-level selection */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={() => setShowAdvancedSublevels(!showAdvancedSublevels)}
            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            {showAdvancedSublevels ? (
              <>
                <ChevronUp className="size-3.5" />
                Hide sub-levels (A1.1, A1.2, …)
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                Select precise sub-level (e.g. B1.2, B2.1)
              </>
            )}
          </button>

          {showAdvancedSublevels && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 rounded-2xl border border-surface-800 bg-surface-950/70 p-3">
              {CEFR_LEVELS.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => {
                    setSelectedSubLevel(sub);
                    setSelectedMain(sub.slice(0, 2) as MainCefrLevel);
                  }}
                  className={`rounded-xl border py-1.5 px-2 text-xs font-mono font-bold transition-all ${
                    selectedSubLevel === sub
                      ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                      : 'border-surface-800 bg-surface-900/40 text-surface-400 hover:border-surface-700 hover:text-surface-200'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-10 rounded-xl px-4 text-xs font-medium text-surface-400 hover:text-surface-200 transition-colors"
            >
              Skip for now
            </button>
          )}
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={handleSave}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-indigo-400 active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles className="size-3.5" />
            {mutation.isPending ? 'Saving level…' : `Set Level to ${showAdvancedSublevels ? selectedSubLevel : selectedMain}`}
          </button>
        </div>
      </div>
    </div>
  );
}
