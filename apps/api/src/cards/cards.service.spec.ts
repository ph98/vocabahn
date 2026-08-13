import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardsService } from './cards.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The FSRS fields undo has to restore exactly. `ReviewLog` is the source of
 * truth for every one of them.
 */
const FSRS_FIELDS = ['due', 'stability', 'difficulty', 'reps', 'lapses', 'state', 'lastReview'] as const;

type CardRow = {
  id: string;
  userId: string;
  dictionaryEntryId: string;
  knownState: string;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: string;
  lastReview: Date | null;
  dictionaryEntry: unknown;
};

type LogRow = {
  id: string;
  cardId: string;
  userId: string;
  rating: string;
  latencyMs: number | null;
  state: string;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reviewedAt: Date;
};

const DICTIONARY_ENTRY = {
  id: 'entry-1',
  word: 'Haus',
  translation: 'house',
  emoji: null,
  imageUrl: null,
  audioUrl: null,
  lexiconEntry: { pos: 'noun', frequencyRank: 100 },
  examples: [],
};

function newCardRow(overrides: Partial<CardRow> = {}): CardRow {
  return {
    id: 'card-1',
    userId: 'user-1',
    dictionaryEntryId: 'entry-1',
    knownState: 'ACTIVE',
    due: new Date('2026-01-01T00:00:00.000Z'),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'NEW',
    lastReview: null,
    dictionaryEntry: DICTIONARY_ENTRY,
    ...overrides,
  };
}

/**
 * A minimal in-memory stand-in for the two tables `CardsService` owns. Specs in
 * this repo instantiate services with a mocked Prisma rather than a database,
 * but undo is only meaningful against real stored rows: it deletes a log and
 * recomputes the card from what is left, so the store has to actually remember.
 */
function makePrismaStub() {
  const cards = new Map<string, CardRow>();
  const logs: LogRow[] = [];
  let logSeq = 0;

  const orderLogs = (rows: LogRow[], orderBy: unknown): LogRow[] => {
    const clauses = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, 'asc' | 'desc'>[];
    return [...rows].sort((a, b) => {
      for (const clause of clauses) {
        const [field, dir] = Object.entries(clause)[0] as [keyof LogRow, 'asc' | 'desc'];
        const av = a[field] as unknown as number | string | Date;
        const bv = b[field] as unknown as number | string | Date;
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const prisma = {
    // Prisma runs an array transaction sequentially; the stub's operations have
    // already executed by the time they land here, in construction order.
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    card: {
      findFirst: ({ where }: { where: { id: string; userId: string } }) =>
        Promise.resolve(
          [...cards.values()].find((c) => c.id === where.id && c.userId === where.userId) ?? null,
        ),
      update: ({ where, data }: { where: { id: string }; data: Partial<CardRow> }) => {
        const existing = cards.get(where.id);
        if (!existing) throw new Error(`no card ${where.id}`);
        const updated = { ...existing, ...data };
        cards.set(where.id, updated);
        return Promise.resolve(updated);
      },
    },
    reviewLog: {
      create: ({ data }: { data: Omit<LogRow, 'id' | 'latencyMs'> & { latencyMs?: number } }) => {
        // cuids are monotonic, so a zero-padded counter models the tiebreak.
        const row: LogRow = { ...data, latencyMs: data.latencyMs ?? null, id: `log-${String(++logSeq).padStart(4, '0')}` };
        logs.push(row);
        return Promise.resolve(row);
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<LogRow> }) => {
        const index = logs.findIndex((l) => l.id === where.id);
        logs[index] = { ...logs[index], ...data };
        return Promise.resolve(logs[index]);
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = logs.findIndex((l) => l.id === where.id);
        const [removed] = logs.splice(index, 1);
        return Promise.resolve(removed);
      },
      findMany: ({ where, orderBy }: { where: { cardId: string }; orderBy: unknown }) =>
        Promise.resolve(orderLogs(logs.filter((l) => l.cardId === where.cardId), orderBy)),
      findFirst: ({ where, orderBy }: { where: { cardId: string; userId: string }; orderBy: unknown }) =>
        Promise.resolve(
          orderLogs(
            logs.filter((l) => l.cardId === where.cardId && l.userId === where.userId),
            orderBy,
          )[0] ?? null,
        ),
    },
  };

  return { prisma, cards, logs };
}

function snapshotOf(card: CardRow) {
  return Object.fromEntries(FSRS_FIELDS.map((f) => [f, card[f]]));
}

describe('CardsService.undoLastReview', () => {
  let service: CardsService;
  let knowledge: { recomputeAfterReview: ReturnType<typeof vi.fn>; undoKnown: ReturnType<typeof vi.fn> };
  let store: ReturnType<typeof makePrismaStub>;

  beforeEach(() => {
    store = makePrismaStub();
    store.cards.set('card-1', newCardRow());
    knowledge = {
      recomputeAfterReview: vi.fn().mockResolvedValue(null),
      undoKnown: vi.fn().mockResolvedValue(undefined),
    };
    service = new CardsService(
      store.prisma as unknown as PrismaService,
      knowledge as unknown as KnowledgeService,
    );
  });

  it('restores the exact FSRS state the card had before the undone rating', async () => {
    // A first review gives the card real, non-default FSRS numbers, so the
    // comparison below is not just "back to an empty card".
    await service.submitReview('user-1', 'card-1', { rating: 'GOOD', latencyMs: 1200 });
    const before = snapshotOf(store.cards.get('card-1')!);

    await service.submitReview('user-1', 'card-1', { rating: 'AGAIN', latencyMs: 800 });
    const after = snapshotOf(store.cards.get('card-1')!);
    expect(after).not.toEqual(before);

    const result = await service.undoLastReview('user-1', 'card-1');

    expect(snapshotOf(store.cards.get('card-1')!)).toEqual(before);
    expect(result.undoneRating).toBe('AGAIN');
    expect(result.card.due).toBe((before.due as Date).toISOString());
    // Exactly one log removed — the newest one — and the survivor untouched.
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]!.rating).toBe('GOOD');
  });

  it('returns a card to a pristine NEW state when its only review is undone', async () => {
    await service.submitReview('user-1', 'card-1', { rating: 'EASY' });
    expect(store.logs).toHaveLength(1);

    await service.undoLastReview('user-1', 'card-1');

    const card = store.cards.get('card-1')!;
    expect(card.state).toBe('NEW');
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.stability).toBe(0);
    expect(card.lastReview).toBeNull();
    expect(store.logs).toHaveLength(0);
  });

  it('undoes only the newest review, leaving older history intact', async () => {
    await service.submitReview('user-1', 'card-1', { rating: 'GOOD' });
    await service.submitReview('user-1', 'card-1', { rating: 'GOOD' });
    await service.submitReview('user-1', 'card-1', { rating: 'HARD' });

    await service.undoLastReview('user-1', 'card-1');

    expect(store.logs.map((l) => l.rating)).toEqual(['GOOD', 'GOOD']);
    expect(store.cards.get('card-1')!.reps).toBe(2);
  });

  it('reverts an auto-graduation the undone review caused', async () => {
    await service.submitReview('user-1', 'card-1', { rating: 'EASY' });
    // Stand in for recomputeAfterReview having graduated the card.
    store.cards.set('card-1', { ...store.cards.get('card-1')!, knownState: 'AUTO_KNOWN' });

    const result = await service.undoLastReview('user-1', 'card-1');

    expect(result.revertedGraduation).toBe(true);
    expect(knowledge.undoKnown).toHaveBeenCalledWith('user-1', 'card-1');
  });

  it('leaves knownState alone when the card was not auto-graduated', async () => {
    await service.submitReview('user-1', 'card-1', { rating: 'GOOD' });

    const result = await service.undoLastReview('user-1', 'card-1');

    expect(result.revertedGraduation).toBe(false);
    expect(knowledge.undoKnown).not.toHaveBeenCalled();
  });

  it('recomputes the knowledge score after rolling the review back', async () => {
    await service.submitReview('user-1', 'card-1', { rating: 'GOOD' });
    knowledge.recomputeAfterReview.mockClear();

    await service.undoLastReview('user-1', 'card-1');

    expect(knowledge.recomputeAfterReview).toHaveBeenCalledWith('user-1', 'card-1');
  });

  it('refuses with 409 Conflict when the card has no review to undo', async () => {
    await expect(service.undoLastReview('user-1', 'card-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses with 404 Not Found for a card the caller does not own', async () => {
    await service.submitReview('user-1', 'card-1', { rating: 'GOOD' });

    await expect(service.undoLastReview('other-user', 'card-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(store.logs).toHaveLength(1);
  });

  it("ignores another user's review of the same card", async () => {
    await service.submitReview('user-1', 'card-1', { rating: 'GOOD' });
    // A log attributed to someone else must not be undoable by user-1.
    store.logs.push({ ...store.logs[0]!, id: 'log-9999', userId: 'other-user', rating: 'EASY' });

    const result = await service.undoLastReview('user-1', 'card-1');

    expect(result.undoneRating).toBe('GOOD');
    expect(store.logs.map((l) => l.userId)).toEqual(['other-user']);
  });
});
