/** Device-only draft persistence. This module never submits a meal. */
export function createMealDrafts(namespace, { storage = globalThis.localStorage, indexedDB = globalThis.indexedDB } = {}) {
  if (!namespace) throw new Error('A user or synthetic workspace namespace is required.');
  let database;
  let queue = Promise.resolve();
  const prefix = `mealdaddy-draft:${namespace}:`;
  function open() {
    if (!indexedDB) return Promise.resolve(null);
    return database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('mealdaddy-device-drafts-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transact(key, action, value) {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', action === 'get' ? 'readonly' : 'readwrite');
      const objectStore = tx.objectStore('drafts');
      const request = action === 'get' ? objectStore.get(prefix + key) : action === 'delete' ? objectStore.delete(prefix + key) : objectStore.put(value, prefix + key);
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Draft storage transaction aborted.'));
    });
  }
  function serial(work) {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  }
  return {
    save(key, value) {
      const draft = { ...value, savedAt: Date.now() };
      // Immediate text backup survives pagehide even when the IDB task is suspended.
      const { photo, ...text } = draft;
      text.photoIdentity = photo ? `${photo.name}:${photo.size}:${photo.lastModified}` : null;
      let textStored = false;
      try {
        if (storage) { storage.setItem(prefix + key, JSON.stringify(text)); textStored = true; }
      } catch { /* IDB remains the primary store. */ }
      return serial(async () => {
        let db;
        try { db = await open(); } catch { /* A blocked IDB must not prevent the text fallback. */ }
        if (!db && photo) throw new Error('This browser cannot preserve draft photos. Keep this page open.');
        if (!db && !textStored) throw new Error('Draft storage is unavailable. Keep this page open.');
        if (db) {
          try { await transact(key, 'put', draft); }
          catch {
            if (photo) throw new Error('This browser cannot preserve draft photos. Keep this page open.');
            if (!textStored) throw new Error('Draft storage is unavailable. Keep this page open.');
          }
        }
        return draft;
      });
    },
    read(key) {
      return serial(async () => {
        let text = null;
        try { text = JSON.parse(storage?.getItem(prefix + key) || 'null'); } catch {}
        let saved = null;
        try { saved = await transact(key, 'get'); } catch { /* Fall back to text. */ }
        if (text?.deleted) return null;
        if (text && text.savedAt >= (saved?.savedAt || 0)) return { ...text, ...(saved?.photo && text.photoIdentity === `${saved.photo.name}:${saved.photo.size}:${saved.photo.lastModified}` ? { photo: saved.photo } : {}) };
        return saved || text;
      });
    },
    remove(key) {
      try { storage?.setItem(prefix + key, JSON.stringify({ deleted: true, savedAt: Date.now() })); } catch {}
      return serial(async () => { try { if (await open()) await transact(key, 'delete'); } catch { /* Tombstone prevents stale text/photo restoration. */ } });
    }
  };
}
