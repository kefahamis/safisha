"use client";

import type { Command } from "@/lib/commands";

/*
 * Commands that couldn't reach the server, kept in IndexedDB so a collector can
 * keep working through a dead zone. A queued stop may carry its proof photo as
 * a Blob; it is uploaded first when the queue flushes.
 */

export interface Queued {
  key?: number;
  cmd: Command;
  photo?: Blob;
  at: number;
}

const DB_NAME = "zoa-outbox";
const STORE = "commands";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export const enqueue = (item: Queued) => tx("readwrite", (s) => s.add(item));
export const list = () => tx<Queued[]>("readonly", (s) => s.getAll() as IDBRequest<Queued[]>);
export const remove = (key: number) => tx("readwrite", (s) => s.delete(key));

/** Commands worth keeping when offline: the collector's route, location and vehicle records. */
export const QUEUEABLE = new Set<Command["type"]>([
  "route.mark",
  "route.undo",
  "fleet.setSharing",
  "fleet.gps",
  "fleet.check",
  "fleet.fuel",
  "fleet.incident",
]);

/** True for a network failure rather than a server answer. */
export const isNetworkError = (err: unknown) =>
  err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError");
