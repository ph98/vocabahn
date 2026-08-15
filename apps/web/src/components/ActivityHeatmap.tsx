import { useEffect, useRef, useState, useCallback } from 'react';
import { FollowTooltip, useFollowTooltip } from './FollowTooltip';

export interface HeatmapData {
  date: string;
  count: number;
}

export interface ActivityHeatmapProps {
  data: HeatmapData[];
}

const CELL_SIZE = 14;
const CELL_GAP = 6;
const CELL_RADIUS = 2.5;
const NUM_ROWS = 7;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * High-performance single-element activity heatmap rendered on HTML5 Canvas.
 * Replaces 365 individual DOM nodes and multi-tween GSAP cascades with a single
 * hardware-accelerated 2D canvas draw pass and coordinate-based pointer picking.
 */
export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const tooltip = useFollowTooltip<HeatmapData>();

  const numCols = Math.max(1, Math.ceil(data.length / NUM_ROWS));
  const cssWidth = numCols * CELL_SIZE + (numCols - 1) * CELL_GAP;
  const cssHeight = NUM_ROWS * CELL_SIZE + (NUM_ROWS - 1) * CELL_GAP;

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    data.forEach((cell, index) => {
      const col = Math.floor(index / NUM_ROWS);
      const row = index % NUM_ROWS;
      const x = col * (CELL_SIZE + CELL_GAP);
      const y = row * (CELL_SIZE + CELL_GAP);

      let intensity = 0;
      if (cell.count > 0) intensity = 1;
      if (cell.count >= 5) intensity = 2;
      if (cell.count >= 10) intensity = 3;
      if (cell.count >= 20) intensity = 4;

      drawRoundedRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS);

      if (intensity === 0) {
        ctx.fillStyle = 'rgba(24, 24, 27, 0.65)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(63, 63, 70, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (intensity === 1) {
        const grad = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        grad.addColorStop(0, '#082f49');
        grad.addColorStop(0.5, '#0e7490');
        grad.addColorStop(1, '#0369a1');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (intensity === 2) {
        const grad = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        grad.addColorStop(0, '#1d4ed8');
        grad.addColorStop(0.5, '#4338ca');
        grad.addColorStop(1, '#6d28d9');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (intensity === 3) {
        const grad = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        grad.addColorStop(0, '#6366f1');
        grad.addColorStop(0.5, '#8b5cf6');
        grad.addColorStop(1, '#c026d3');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(196, 181, 253, 0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        const grad = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        grad.addColorStop(0, '#a855f7');
        grad.addColorStop(0.5, '#e879f9');
        grad.addColorStop(1, '#f472b6');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(251, 207, 232, 0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Highlight cell border on hover
      if (index === hoveredIndex) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, x - 0.5, y - 0.5, CELL_SIZE + 1, CELL_SIZE + 1, CELL_RADIUS + 0.5);
        ctx.stroke();
        ctx.restore();
      }
    });

    ctx.restore();
  }, [data, cssWidth, cssHeight, hoveredIndex]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / (CELL_SIZE + CELL_GAP));
    const row = Math.floor(y / (CELL_SIZE + CELL_GAP));
    const cellX = col * (CELL_SIZE + CELL_GAP);
    const cellY = row * (CELL_SIZE + CELL_GAP);

    const withinCell =
      x >= cellX &&
      x <= cellX + CELL_SIZE &&
      y >= cellY &&
      y <= cellY + CELL_SIZE;

    if (col >= 0 && col < numCols && row >= 0 && row < NUM_ROWS && withinCell) {
      const index = col * NUM_ROWS + row;
      const targetCell = data[index];
      if (targetCell) {
        setHoveredIndex(index);
        tooltip.showAtPointer(e, targetCell.date, targetCell);
        return;
      }
    }

    setHoveredIndex(null);
    tooltip.hide();
  };

  const handlePointerLeave = () => {
    setHoveredIndex(null);
    tooltip.hide();
  };

  return (
    <div className="relative w-full">
      <div className="overflow-x-auto pb-4 custom-scrollbar">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Activity heatmap"
          className="cursor-crosshair block select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
      </div>

      <FollowTooltip controller={tooltip}>
        {tooltip.value && (
          <>
            <div className="font-bold text-surface-100">
              {tooltip.value.count} review{tooltip.value.count !== 1 && 's'}
            </div>
            <div className="text-surface-400 mt-0.5">
              {new Date(tooltip.value.date).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </>
        )}
      </FollowTooltip>
    </div>
  );
}
