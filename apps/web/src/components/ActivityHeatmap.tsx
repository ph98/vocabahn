import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from '../lib/motion';
import { FollowTooltip, useFollowTooltip } from './FollowTooltip';

interface HeatmapData {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltip = useFollowTooltip<HeatmapData>();

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    // Entrance animation for cells: cascade in
    gsap.fromTo(
      '.heatmap-cell',
      { scale: 0, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.6,
        ease: 'back.out(1.5)',
        stagger: {
          amount: 1.5,
          from: 'start',
          grid: 'auto',
        },
      }
    );
  }, { scope: containerRef });

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* 
        We use an inner div with w-max so the grid doesn't compress the columns. 
        CSS grid auto-flow column ensures days fill vertically first, then horizontally.
      */}
      <div className="overflow-x-auto pb-4 custom-scrollbar">
        <div className="grid grid-rows-7 grid-flow-col gap-1.5 w-max pr-4">
          {data.map((cell) => {
            // Determine intensity 0-4
            let intensity = 0;
            if (cell.count > 0) intensity = 1;
            if (cell.count >= 5) intensity = 2;
            if (cell.count >= 10) intensity = 3;
            if (cell.count >= 20) intensity = 4;

            const intensityClasses = [
              'shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] bg-surface-900/60 border border-surface-800/40', // 0: Empty (Inner shadow)
              'bg-gradient-to-br from-indigo-950 via-cyan-900/80 to-blue-900/80 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.35)]', // 1: Light gradient glow
              'bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600 border border-blue-400/60 shadow-[0_0_12px_rgba(79,70,229,0.55)]', // 2: Medium gradient glow
              'bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 border border-indigo-300/80 shadow-[0_0_16px_rgba(139,92,246,0.7)] text-white', // 3: High gradient glow
              'bg-gradient-to-br from-violet-400 via-fuchsia-400 to-pink-300 border border-pink-200 shadow-[0_0_22px_rgba(236,72,153,0.85)] text-surface-950', // 4: Max gradient glow
            ];

            return (
              <div
                key={cell.date}
                className={`heatmap-cell h-3.5 w-3.5 rounded-sm transition-all duration-300 hover:scale-[1.3] motion-reduce:hover:scale-100 hover:z-10 hover:border-white/50 cursor-crosshair ${intensityClasses[intensity]}`}
                onMouseMove={(e) => tooltip.showAtPointer(e, cell.date, cell)}
                onMouseLeave={tooltip.hide}
              />
            );
          })}
        </div>
      </div>

      {/* Same shared hover tooltip the progress bars use. */}
      <FollowTooltip controller={tooltip}>
        {tooltip.value && (
          <>
            <div className="font-bold text-surface-100">{tooltip.value.count} review{tooltip.value.count !== 1 && 's'}</div>
            <div className="text-surface-400 mt-0.5">{new Date(tooltip.value.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </>
        )}
      </FollowTooltip>
    </div>
  );
}
