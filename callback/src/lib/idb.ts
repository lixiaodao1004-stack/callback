// Recordings live in IndexedDB, never in localStorage.
const DB = 'callback-recordings';
const STORE = 'recordings';

export interface RecordingMeta {
  id: string;
  sessionId: string;
  kind: 'audio' | 'video';
  mime: string;
  durationSec: number;
  createdAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available in this browser.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function saveRecording(meta: RecordingMeta, blob: Blob) {
  return tx('readwrite', (s) => s.put({ ...meta, blob }));
}

export function getRecording(id: string): Promise<(RecordingMeta & { blob: Blob }) | undefined> {
  return tx('readonly', (s) => s.get(id));
}

export function deleteRecording(id: string) {
  return tx('readwrite', (s) => s.delete(id));
}

export function listRecordings(): Promise<RecordingMeta[]> {
  return tx('readonly', (s) => s.getAll()).then((all) => (all as (RecordingMeta & { blob: Blob })[]).map(({ blob: _b, ...m }) => m));
}

export async function clearRecordings() {
  return tx('readwrite', (s) => s.clear());
}
