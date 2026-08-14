import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityHeatmap } from '../ActivityHeatmap';

const MOCK_DATA = [
  { date: '2026-06-12', count: 0 },
  { date: '2026-06-13', count: 3 },
  { date: '2026-06-14', count: 7 },
  { date: '2026-06-15', count: 12 },
  { date: '2026-06-16', count: 25 },
];

describe('ActivityHeatmap', () => {
  it('renders a single high-performance canvas element with correct role and aria-label', () => {
    render(<ActivityHeatmap data={MOCK_DATA} />);
    const canvas = screen.getByRole('img', { name: /Activity heatmap/i });
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName.toLowerCase()).toBe('canvas');
  });

  it('renders only one canvas element instead of multiple cell DOM nodes', () => {
    const { container } = render(<ActivityHeatmap data={MOCK_DATA} />);
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(1);
    const cellDivs = container.querySelectorAll('.heatmap-cell');
    expect(cellDivs.length).toBe(0);
  });

  it('handles pointer interactions without crashing', () => {
    render(<ActivityHeatmap data={MOCK_DATA} />);
    const canvas = screen.getByRole('img', { name: /Activity heatmap/i });

    // Mock getBoundingClientRect for jsdom
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 200,
      width: 500,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Move pointer over first cell (col 0, row 0 -> 2026-06-12)
    fireEvent.pointerMove(canvas, { clientX: 5, clientY: 5 });

    // Pointer leave
    fireEvent.pointerLeave(canvas);
  });
});
