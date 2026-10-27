/**
 * Keeps the imported model's mesh (.glb) in IndexedDB so a reload shows it again. A per-viewer
 * convenience: every call tolerates missing or blocked storage, and the spec itself (in
 * localStorage) is enough for the models to run.
 */
const DB = 'envelope';
const STORE = 'models';
const KEY = 'imported';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveImportedModel(glb: Blob): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(glb, KEY));
  } catch {
    // Storage unavailable: the mesh still shows until the page is reloaded.
  }
}

export async function loadImportedModel(): Promise<Blob | null> {
  try {
    return ((await tx('readonly', (s) => s.get(KEY))) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearImportedModel(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    // Nothing stored or storage unavailable.
  }
}
