import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

interface HeatmapData {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<HeatmapData | null>(null);

  useGSAP(() => {
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

  const handleMouseMove = (e: React.MouseEvent, cell: HeatmapData) => {
    setHoveredCell(cell);
    if (tooltipRef.current) {
      // Use GSAP quickTo for a buttery smooth tooltip following effect
      gsap.to(tooltipRef.current, {
        x: e.clientX,
        y: e.clientY - 45, // offset above cursor
        duration: 0.2,
        ease: 'power3.out',
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

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
            // Let's say 1-4 reviews = level 1, 5-9 = level 2, 10-19 = level 3, 20+ = level 4
            let intensity = 0;
            if (cell.count > 0) intensity = 1;
            if (cell.count >= 5) intensity = 2;
            if (cell.count >= 10) intensity = 3;
            if (cell.count >= 20) intensity = 4;

            const intensityClasses = [
              'bg-surface-800/30 border border-surface-700/30', // 0: Empty
              'bg-indigo-900/60 border border-indigo-700/50 shadow-[0_0_8px_rgba(67,56,202,0.3)]', // 1: Light
              'bg-indigo-600/70 border border-indigo-500/60 shadow-[0_0_12px_rgba(79,70,229,0.5)]', // 2: Medium
              'bg-indigo-400/80 border border-indigo-300/70 shadow-[0_0_16px_rgba(99,102,241,0.6)] text-indigo-900', // 3: High
              'bg-indigo-300 border border-indigo-200 shadow-[0_0_20px_rgba(129,140,248,0.8)] text-indigo-950', // 4: Max
            ];

            return (
              <div
                key={cell.date}
                className={`heatmap-cell h-3.5 w-3.5 rounded-sm transition-all duration-300 hover:scale-[1.3] hover:z-10 hover:border-white/50 cursor-crosshair ${intensityClasses[intensity]}`}
                onMouseMove={(e) => handleMouseMove(e, cell)}
                onMouseLeave={handleMouseLeave}
              />
            );
          })}
        </div>
      </div>

      {/* Floating Tooltip */}
      <div
        ref={tooltipRef}
        className={`fixed top-0 left-0 z-50 pointer-events-none px-3 py-2 rounded-xl bg-surface-950/95 backdrop-blur-md border border-surface-800 shadow-2xl transition-opacity duration-200 text-xs text-center ${
          hoveredCell ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transform: 'translate(-50%, -100%)', willChange: 'transform' }}
      >
        {hoveredCell && (
          <>
            <div className="font-bold text-surface-100">{hoveredCell.count} review{hoveredCell.count !== 1 && 's'}</div>
            <div className="text-surface-400 mt-0.5">{new Date(hoveredCell.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </>
        )}
      </div>
    </div>
  );
}
