const databaseName = "mealdaddy-private-device-v1";
const databaseVersion = 1;
const storeName = "saved_foods";
const allowedStorageModes = new Set(["sync_cache", "device_only", "one_time"]);

function preferenceKey(userId) {
  return `mealdaddy-saved-food-storage:${userId}`;
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Private device storage is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: "cache_key" });
        store.createIndex("user_scope", ["user_id", "storage_scope"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Private device storage could not be opened."));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Private device storage could not be updated."));
    transaction.onabort = () => reject(transaction.error || new Error("Private device storage update was stopped."));
  });
}

async function recordsFor(userId, scope) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    const completed = transactionComplete(transaction);
    const request = transaction.objectStore(storeName).index("user_scope").getAll([userId, scope]);
    const records = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("Private device foods could not be read."));
    });
    await completed;
    return records;
  } finally {
    database.close();
  }
}

function cacheKey(userId, scope, id) {
  return `${scope}:${userId}:${id}`;
}

export function getSavedFoodStorageMode(userId) {
  try {
    const mode = localStorage.getItem(preferenceKey(userId));
    return allowedStorageModes.has(mode) ? mode : "sync_cache";
  } catch {
    return "sync_cache";
  }
}

export function setSavedFoodStorageMode(userId, mode) {
  const safeMode = allowedStorageModes.has(mode) ? mode : "sync_cache";
  try {
    localStorage.setItem(preferenceKey(userId), safeMode);
  } catch {
    // The selected mode still applies for the current page when preference storage is unavailable.
  }
  return safeMode;
}

export async function requestPersistentDeviceStorage() {
  if (!navigator.storage?.persist) return { supported: false, persistent: false };
  try {
    return { supported: true, persistent: await navigator.storage.persist() };
  } catch {
    return { supported: true, persistent: false };
  }
}

export async function getDeviceSavedFoods(userId) {
  return recordsFor(userId, "device");
}

export async function getCachedSyncedFoods(userId) {
  return recordsFor(userId, "sync");
}

export async function replaceSyncedFoodCache(userId, foods) {
  const existing = await recordsFor(userId, "sync");
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    existing.forEach((food) => store.delete(food.cache_key));
    foods.forEach((food) => store.put({
      ...food,
      user_id: userId,
      storage_scope: "sync",
      cache_key: cacheKey(userId, "sync", food.id),
      cached_at: new Date().toISOString()
    }));
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function saveDeviceFood(userId, food) {
  const id = food.id || crypto.randomUUID();
  const record = {
    ...food,
    id,
    user_id: userId,
    storage_scope: "device",
    cache_key: cacheKey(userId, "device", id),
    updated_at: new Date().toISOString(),
    created_at: food.created_at || new Date().toISOString()
  };
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    await transactionComplete(transaction);
    return record;
  } finally {
    database.close();
  }
}

export async function updateSyncedFoodCache(userId, food) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({
      ...food,
      user_id: userId,
      storage_scope: "sync",
      cache_key: cacheKey(userId, "sync", food.id),
      cached_at: new Date().toISOString()
    });
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function deleteLocalSavedFood(userId, scope, id) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(cacheKey(userId, scope, id));
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearLocalSavedFoods(userId) {
  const records = [
    ...(await recordsFor(userId, "sync")),
    ...(await recordsFor(userId, "device"))
  ];
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    records.forEach((food) => store.delete(food.cache_key));
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
  try {
    localStorage.removeItem(preferenceKey(userId));
  } catch {
    // Account deletion can continue even if the browser already removed this preference.
  }
}
