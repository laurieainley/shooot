// How many units the preparer may run at once, and a way to wait for a free place. The limit changes while it runs (1 while the editor
// plays or scrubs, more when idle, 0 to hold everything). Pure scheduling.

export class Gate {
    private limit: number
    private running = 0
    private waiting: { go: () => void; fail: (e: unknown) => void; signal?: AbortSignal; onAbort?: () => void }[] = []

    constructor(limit: number) { this.limit = limit }

    get active(): number { return this.running }

    setLimit(n: number): void {
        this.limit = Math.max(0, Math.floor(n))
        this.pump()
    }

    /** Resolves with a release function when a place is free; rejects with an AbortError when `signal` aborts first. */
    acquire(signal?: AbortSignal): Promise<() => void> {
        if (signal?.aborted) return Promise.reject(new DOMException('Render cancelled', 'AbortError'))
        return new Promise((resolve, reject) => {
            const w: (typeof this.waiting)[number] = {
                go: () => { this.running++; if (w.onAbort) signal?.removeEventListener('abort', w.onAbort); let done = false; resolve(() => { if (done) return; done = true; this.running--; this.pump() }) },
                fail: reject, signal,
            }
            w.onAbort = () => { this.waiting = this.waiting.filter((x) => x !== w); reject(new DOMException('Render cancelled', 'AbortError')) }
            signal?.addEventListener('abort', w.onAbort, { once: true })
            this.waiting.push(w)
            this.pump()
        })
    }

    private pump(): void {
        while (this.waiting.length > 0 && this.running < this.limit) this.waiting.shift()!.go()
    }
}
