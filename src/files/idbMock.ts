// In-memory idb-keyval for tests: vi.mock('idb-keyval', async () => (await import('./idbMock')).idbMock())
export function idbMock() {
    const stores = new Map<string, Map<string, unknown>>()
    const pick = (s?: unknown): Map<string, unknown> => {
        const k = (s as string | undefined) ?? 'default'
        if (!stores.has(k)) stores.set(k, new Map())
        return stores.get(k)!
    }
    return {
        createStore: (db: string, name: string): string => `${db}/${name}`,
        get: async (k: string, s?: unknown): Promise<unknown> => pick(s).get(k),
        set: async (k: string, v: unknown, s?: unknown): Promise<void> => { pick(s).set(k, v) },
        del: async (k: string, s?: unknown): Promise<void> => { pick(s).delete(k) },
        entries: async (s?: unknown): Promise<[string, unknown][]> => [...pick(s).entries()],
        __reset: (): void => stores.clear(),
    }
}
