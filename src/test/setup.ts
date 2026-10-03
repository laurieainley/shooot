import '@testing-library/jest-dom'

// Node 22+ exposes a global `localStorage` that is non-functional unless
// `--localstorage-file` is given, and it shadows happy-dom's. Zustand's
// `persist` middleware needs a working Storage, so install an in-memory one.
if (typeof globalThis.localStorage?.setItem !== 'function') {
    const data = new Map<string, string>()
    const memoryStorage: Storage = {
        get length() { return data.size },
        clear: () => data.clear(),
        getItem: (key) => data.get(key) ?? null,
        key: (index) => Array.from(data.keys())[index] ?? null,
        removeItem: (key) => { data.delete(key) },
        setItem: (key, value) => { data.set(key, String(value)) },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true, writable: true })
}
