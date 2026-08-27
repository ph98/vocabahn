import { describe, expect, it } from 'vitest';
import { resolveCefrLevel } from './enrichment.processor';

describe('resolveCefrLevel', () => {
  it('fills a blank from the AI', () => {
    expect(resolveCefrLevel(null, 'B1.2')).toBe('B1.2');
  });

  it('keeps a level the entry already has', () => {
    expect(resolveCefrLevel('A1', 'B1.2')).toBe('A1');
  });

  // The regression: enrichment tagged "Ich" and "Haben" B2.1 over their curated
  // A1, and those entries then drove the learner-level inference to B2.
  it('never lets the AI raise a curated beginner word', () => {
    expect(resolveCefrLevel('A1', 'B2.1')).toBe('A1');
    expect(resolveCefrLevel('A1.1', 'C2.2')).toBe('A1.1');
  });

  it('leaves the level null when neither side has one', () => {
    expect(resolveCefrLevel(null, null)).toBeNull();
    expect(resolveCefrLevel(null, undefined)).toBeNull();
  });
});
