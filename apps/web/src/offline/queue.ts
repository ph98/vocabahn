import type { SyncReviewItem } from '@vocabahn/shared';
import { syncReviews } from '../api';

const DB_NAME = 'vocabahn-offline';
const STORE_NAME = 'review-queue';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = fn(store);
      tx.oncomplete = () => resolve(result as T);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Queues a review completed while offline, to be synced on reconnect (PRD §4.4). */
export async function enqueueReview(item: SyncReviewItem): Promise<void> {
  await withStore('readwrite', (store) => {
    store.add(item);
  });
}

export async function getQueuedReviews(): Promise<SyncReviewItem[]> {
  return withStore('readonly', (store) => {
    return new Promise<SyncReviewItem[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as SyncReviewItem[]);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getQueueCount(): Promise<number> {
  return withStore('readonly', (store) => {
    return new Promise<number>((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

async function clearQueue(): Promise<void> {
  await withStore('readwrite', (store) => {
    store.clear();
  });
}

/**
 * Sends all queued offline reviews to the server for timestamp-ordered
 * replay, then clears the local queue. No-ops (and returns 0) if the queue
 * is empty or the request fails — callers retry on the next reconnect.
 */
export async function flushQueue(): Promise<number> {
  const items = await getQueuedReviews();
  if (items.length === 0) return 0;

  await syncReviews(items);
  await clearQueue();
  return items.length;
}
