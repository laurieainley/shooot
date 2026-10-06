// After a deploy, a tab still running the previous build can't fetch that build's lazily loaded files
// (their hashed names are gone). Recognise that and allow one automatic reload — never a loop.
const STALE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i

export function isStaleChunkError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
    return STALE.test(message)
}

const RELOAD_GUARD_MS = 60_000

export function shouldReload(lastReloadAt: number | null, now: number): boolean {
    return lastReloadAt === null || now - lastReloadAt > RELOAD_GUARD_MS
}
