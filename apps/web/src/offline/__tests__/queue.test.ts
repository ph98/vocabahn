import type { SyncReviewItem } from '@vocabahn/shared';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api', () => ({ syncReviews: vi.fn().mockResolvedValue(0) }));

const { syncReviews } = await import('../../api');
const { dequeueLatestReview, enqueueReview, flushQueue, getQueueCount, getQueuedReviews } = await import('../queue');

const review = (cardId: string, overrides: Partial<SyncReviewItem> = {}): SyncReviewItem => ({
  cardId,
  rating: 'GOOD',
  latencyMs: 1000,
  reviewedAt: new Date('2026-01-01T10:00:00.000Z').toISOString(),
  ...overrides,
});

describe('offline review queue', () => {
  beforeEach(() => {
    // A fresh database per test — the store is module-level global state.
    globalThis.indexedDB = new IDBFactory();
    vi.mocked(syncReviews).mockClear();
  });

  it('removes the newest queued review for a card', async () => {
    await enqueueReview(review('card-1', { rating: 'AGAIN' }));
    await enqueueReview(review('card-2'));
    await enqueueReview(review('card-1', { rating: 'EASY' }));

    await expect(dequeueLatestReview('card-1')).resolves.toBe(true);

    const remaining = await getQueuedReviews();
    expect(remaining).toHaveLength(2);
    // The older card-1 rating survives; only the last one was undone.
    expect(remaining.map((r) => r.rating)).toEqual(['AGAIN', 'GOOD']);
    expect(await getQueueCount()).toBe(2);
  });

  it('reports false when the card has nothing queued, so the caller can fall back to the API', async () => {
    await enqueueReview(review('card-2'));

    await expect(dequeueLatestReview('card-1')).resolves.toBe(false);
    expect(await getQueueCount()).toBe(1);
  });

  it('reports false on an empty queue', async () => {
    await expect(dequeueLatestReview('card-1')).resolves.toBe(false);
  });

  it('does not resurrect an undone review when the queue is flushed on reconnect', async () => {
    await enqueueReview(review('card-1', { rating: 'EASY' }));
    await dequeueLatestReview('card-1');

    // Coming back online: nothing left to send, so the server never sees it.
    await expect(flushQueue()).resolves.toBe(0);
    expect(syncReviews).not.toHaveBeenCalled();
  });

  it('still flushes the reviews that were not undone', async () => {
    await enqueueReview(review('card-1', { rating: 'EASY' }));
    await enqueueReview(review('card-2', { rating: 'HARD' }));
    await dequeueLatestReview('card-2');

    await expect(flushQueue()).resolves.toBe(1);
    expect(syncReviews).toHaveBeenCalledWith([expect.objectContaining({ cardId: 'card-1', rating: 'EASY' })]);
    expect(await getQueueCount()).toBe(0);
  });
});
