import {Observable} from 'grainjs';

/**
 * Returns true if storage is functional. In some cass (e.g. when embedded), localStorage may
 * throw errors. If so, we return false. This implementation is the approach taken by store.js.
 */
function testStorage(storage: Storage) {
  try {
    const testStr = '__localStorage_test';
    storage.setItem(testStr, testStr);
    const ok = (storage.getItem(testStr) === testStr);
    storage.removeItem(testStr);
    return ok;
  } catch (e) {
    return false;
  }
}

/**
 * Returns localStorage if functional, or sessionStorage, or an in-memory storage. The fallbacks
 * help with tests, and may help when Grist is embedded.
 */
export function getStorage(): Storage {
  return _storage || (_storage = createStorage());
}

let _storage: Storage|undefined;

function createStorage(): Storage {
  if (typeof localStorage !== 'undefined' && testStorage(localStorage)) {
    return localStorage;
  }
  if (typeof sessionStorage !== 'undefined' && testStorage(sessionStorage)) {
    return sessionStorage;
  }

  // Fall back to a Map-based implementation of (non-persistent) localStorage.
  const values = new Map<string, string>();
  return {
    setItem(key: string, val: string) { values.set(key, val); },
    getItem(key: string) { return values.get(key) ?? null; },
    removeItem(key: string) { values.delete(key); },
    clear() { values.clear(); },
    get length() { return values.size; },
    key(index: number): string|null { throw new Error('Not implemented'); },
  };
}

/**
 * Helper to create a boolean observable whose state is stored in localStorage.
 *
 * Optionally, a default value of true will make the observable start off as true. Note that the
 * same default value should be used for an observable every time it's created.
 */
export function localStorageBoolObs(key: string, defValue = false): Observable<boolean> {
  const store = getStorage();
  const storedNegation = defValue ? 'false' : 'true';
  const obs = Observable.create(null, store.getItem(key) === storedNegation ? !defValue : defValue);
  obs.addListener((val) => val === defValue ? store.removeItem(key) : store.setItem(key, storedNegation));
  return obs;
}

/**
 * Helper to create a string observable whose state is stored in localStorage.
 */
export function localStorageObs(key: string, defaultValue?: string): Observable<string|null> {
  const store = getStorage();
  const obs = Observable.create<string|null>(null, store.getItem(key) ?? defaultValue ?? null);
  obs.addListener((val) => (val === null) ? store.removeItem(key) : store.setItem(key, val));
  return obs;
}
