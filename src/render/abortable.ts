// Awaits on the render path that a stuck codec, decoder or file write could leave pending forever. Cancel must always get through:
// each of these settles as soon as the signal aborts, whether or not the thing it waits for ever does.

export const cancelledError = (): DOMException => new DOMException('Render cancelled', 'AbortError')

/** `p`, but rejects with an AbortError the moment `signal` aborts. What `p` does afterwards is ignored (its rejection is swallowed). */
export function abortable<T>(p: Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (!signal) return p
    if (signal.aborted) { p.catch(() => undefined); return Promise.reject(cancelledError()) }
    return new Promise<T>((resolve, reject) => {
        const onAbort = (): void => reject(cancelledError())
        signal.addEventListener('abort', onAbort, { once: true })
        p.then(
            (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
            (e: unknown) => { signal.removeEventListener('abort', onAbort); reject(e) },
        )
    })
}

/** A signal that aborts when any of `signals` does (AbortSignal.any is not in every browser the editor runs in). */
export function anyAbort(...signals: (AbortSignal | undefined | null)[]): { signal: AbortSignal; dispose: () => void } {
    const ctl = new AbortController()
    const live = signals.filter((s): s is AbortSignal => !!s)
    const fire = (): void => ctl.abort()
    if (live.some((s) => s.aborted)) ctl.abort()
    else for (const s of live) s.addEventListener('abort', fire, { once: true })
    return { signal: ctl.signal, dispose: () => { for (const s of live) s.removeEventListener('abort', fire) } }
}
