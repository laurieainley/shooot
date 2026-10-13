// Runs the units of a re-encode a few at a time, and gives parallelism up (one unit at a time from then on) the moment it looks
// like the cause of a failure, e.g. a second hardware decoder/encoder that the device cannot provide. Pure scheduling: the
// engine supplies what a unit does and how to clean up after a failed one.

export type PoolOptions<J> = {
    jobs: J[]
    /** Units allowed at the same time (1 = a plain queue). */
    width: number
    /** Runs one unit. Must throw on failure after releasing everything the unit held (writer, decoder, encoder). */
    run: (job: J) => Promise<void>
    isAbort: (e: unknown) => boolean
    /** The first failure that happened while another unit was running: the pool drops to one at a time and retries the unit. */
    onFallback: (job: J, e: unknown) => void
    /** A unit failed on its own (nothing else running): true = try it once more (e.g. with a software encoder). */
    retrySerial?: (job: J, e: unknown) => Promise<boolean>
    /** Called once when the pool gives up, so running units can stop early. */
    onFatal?: () => void
}

export async function runPool<J>(o: PoolOptions<J>): Promise<{ width: number; fellBack: boolean }> {
    let width = Math.max(1, Math.floor(o.width))
    let fellBack = false
    let fatal: { error: unknown } | null = null
    const queue = [...o.jobs]
    const retry: J[] = []
    const running = new Set<J>()
    const overlapped = new Set<J>()
    const stop = (e: unknown): void => { if (!fatal) { fatal = { error: e }; o.onFatal?.() } }

    const worker = async (index: number): Promise<void> => {
        for (;;) {
            if (fatal || index >= width) return
            const job = retry.shift() ?? queue.shift()
            if (job === undefined) return
            if (running.size > 0) { for (const r of running) overlapped.add(r); overlapped.add(job) } else overlapped.delete(job)
            running.add(job)
            try {
                await o.run(job)
            } catch (e) {
                running.delete(job)
                if (fatal) return
                if (o.isAbort(e)) { stop(e); return }
                if (overlapped.has(job)) {
                    // Parallelism is the suspect: one at a time for the rest of the render, and this unit goes again.
                    if (width > 1) { width = 1; fellBack = true; o.onFallback(job, e) }
                    overlapped.delete(job)
                    retry.push(job)
                    continue
                }
                let again = false
                try { again = (await o.retrySerial?.(job, e)) ?? false } catch { again = false }
                if (again) { retry.unshift(job); continue }
                stop(e)
                return
            }
            running.delete(job)
        }
    }

    do {
        const n = Math.min(width, queue.length + retry.length)
        await Promise.all(Array.from({ length: n }, (_, i) => worker(i)))
    } while (!fatal && (retry.length > 0 || queue.length > 0))
    if (fatal) throw (fatal as { error: unknown }).error
    return { width, fellBack }
}
