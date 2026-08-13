import { describe, expect, it } from 'vitest';
import { compareLexiconCandidates, isLemma } from './lexicon-ranking';

describe('lexicon-ranking', () => {
  describe('isLemma', () => {
    it('returns true if at least one sense lacks form-of/alt-of tags', () => {
      expect(isLemma([{ tags: ['subordinating'] }])).toBe(true);
      expect(isLemma([{ tags: ['form-of'] }, { tags: ['subordinating'] }])).toBe(true);
    });

    it('returns false if all senses have form-of or alt-of tags', () => {
      expect(isLemma([{ tags: ['form-of'] }])).toBe(false);
      expect(isLemma([{ tags: ['alt-of'] }])).toBe(false);
    });
  });

  describe('compareLexiconCandidates', () => {
    it('prioritizes lowercase conjunction "wenn" over capitalized noun "Wenn"', () => {
      const wennConj = { word: 'wenn', pos: 'conj', _count: { senses: 2 } };
      const wennNoun = { word: 'Wenn', pos: 'noun', _count: { senses: 1 } };

      expect(compareLexiconCandidates(wennConj, wennNoun, 'Wenn')).toBeLessThan(0);
      expect(compareLexiconCandidates(wennNoun, wennConj, 'Wenn')).toBeGreaterThan(0);
    });

    it('prioritizes lowercase interjection "hallo" over capitalized noun "Hallo"', () => {
      const halloIntj = { word: 'hallo', pos: 'intj', _count: { senses: 4 } };
      const halloNoun = { word: 'Hallo', pos: 'noun', _count: { senses: 1 } };

      expect(compareLexiconCandidates(halloIntj, halloNoun, 'Hallo')).toBeLessThan(0);
      expect(compareLexiconCandidates(halloNoun, halloIntj, 'Hallo')).toBeGreaterThan(0);
    });

    it('prioritizes lowercase pronoun "du" over capitalized noun "Du"', () => {
      const duPron = { word: 'du', pos: 'pron', _count: { senses: 1 } };
      const duNoun = { word: 'Du', pos: 'noun', _count: { senses: 1 } };

      expect(compareLexiconCandidates(duPron, duNoun, 'Du')).toBeLessThan(0);
    });

    it('prioritizes capitalized noun "Frau" over lowercase pronoun "frau" when noun has substantially more senses', () => {
      const frauNoun = { word: 'Frau', pos: 'noun', _count: { senses: 5 } };
      const frauPron = { word: 'frau', pos: 'pron', _count: { senses: 1 } };

      expect(compareLexiconCandidates(frauNoun, frauPron, 'Frau')).toBeLessThan(0);
    });
  });
});
