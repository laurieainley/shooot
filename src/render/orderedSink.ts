// Parallel units that write into ONE output without a journal ("Save to file…"). Units run side by side but their packets
// must reach the MP4 in unit order. The unit that is next in line (the "head") streams its packets straight into the output;
// a unit running ahead keeps its encoded packets in memory until every earlier unit has finished, then they are flushed
// in order and that unit carries on as the head. Nothing touches browser storage. Pure scheduling: the engine supplies `emit`.
import type { LogRecord } from './packetLog'
import type { UnitWriter } from './renderJob'

/**
 * Most encoded data one unit running ahead of the head may hold in memory (per unit, so at most (units - 1) x this in total).
 * Past it that unit stops encoding (its next write waits) until it becomes the head, so a slow head can never make memory
 * grow without bound and the render is never slower than one unit at a time. 512 MB is about 100 s of 4K at 40 Mbps, a
 * whole default unit (SEGMENT_SEC = 120) at the 1080p rates, and comfortably inside what a desktop browser tab can hold.
 */
export const AHEAD_BUFFER_CAP_BYTES = 512 * 1024 * 1024

/**
 * Thrown inside a unit that cannot wait for its turn because the unit it waits for is not running (it failed and is queued to
 * go again). The pool treats it like any failure of a parallel unit: the unit goes again, after the earlier ones.
 */
export class LaneRestart extends Error {
    constructor() { super('a unit running ahead was stopped to let an earlier unit go first'); this.name = 'LaneRestart' }
}

export type Lane = UnitWriter & { abort: (reason?: unknown) => Promise<void> }

type LaneState = {
    id: number
    buffer: LogRecord[]
    bytes: number
    /** Finished encoding: nothing more will be written. */
    closed: boolean
    /** Between open() and close()/abort(): a unit is running on it. */
    active: boolean
    /** Packets of this unit were written into the output already (it cannot start over). */
    streamed: boolean
    flushed: boolean
    /** Serialises everything that writes this lane's packets into the output. */
    io: Promise<void>
    waiter: { resolve: () => void; reject: (e: unknown) => void } | null
}

export class OrderedSink {
    private readonly lanes = new Map<number, LaneState>()
    private headIndex = 0
    private poison: unknown = null
    private cancelled: unknown = null

    /**
     * @param order the unit ids in output order
     * @param emit writes one packet into the output
     */
    private readonly order: number[]
    private readonly emit: (r: LogRecord) => Promise<void>
    private readonly capBytes: number

    constructor(order: number[], emit: (r: LogRecord) => Promise<void>, capBytes = AHEAD_BUFFER_CAP_BYTES) {
        this.order = order
        this.emit = emit
        this.capBytes = capBytes
        for (const id of order) this.lanes.set(id, { id, buffer: [], bytes: 0, closed: false, active: false, streamed: false, flushed: false, io: Promise.resolve(), waiter: null })
    }

    /** Bytes held in memory by units that are not the head. */
    get bufferedBytes(): number { let n = 0; for (const l of this.lanes.values()) n += l.bytes; return n }

    private get head(): LaneState | undefined { const id = this.order[this.headIndex]; return id === undefined ? undefined : this.lanes.get(id) }

    /** Starts (or restarts, after a failure) the writer of unit `id`. */
    open(id: number): Lane {
        const lane = this.lanes.get(id)
        if (!lane) throw new Error(`unit ${id} is not part of this output`)
        if (this.cancelled) throw this.cancelled
        if (lane.streamed) throw this.poison ?? new Error('a unit that was already written into the file failed, so it cannot be redone')
        if (lane.closed || lane.flushed) throw new Error(`unit ${id} is already written`)
        lane.buffer = []
        lane.bytes = 0
        lane.active = true
        return {
            write: (r) => this.write(lane, r),
            close: () => this.close(lane),
            abort: (reason) => this.abort(lane, reason),
        }
    }

    /** Stops everything (the render was cancelled or failed): buffers are dropped and units waiting for their turn fail with `reason`. */
    cancel(reason: unknown): void {
        if (!this.cancelled) this.cancelled = reason
        for (const l of this.lanes.values()) {
            l.buffer = []
            l.bytes = 0
            this.release(l, reason)
        }
    }

    private release(l: LaneState, reason: unknown): void {
        const w = l.waiter
        l.waiter = null
        w?.reject(reason)
    }

    private async write(lane: LaneState, r: LogRecord): Promise<void> {
        if (this.cancelled) throw this.cancelled
        if (this.head === lane) return this.writeHead(lane, r)
        lane.buffer.push(r)
        lane.bytes += r.data.byteLength
        if (lane.bytes <= this.capBytes) return
        // Over the cap: wait for the turn (the earlier units cannot be waited for when none of them is running).
        const head = this.head
        if (!head || !head.active) throw new LaneRestart()
        await new Promise<void>((resolve, reject) => { lane.waiter = { resolve, reject } })
        // It is the head now: the packets it held were flushed on the way.
    }

    private async writeHead(lane: LaneState, r: LogRecord): Promise<void> {
        await this.serial(lane, async () => {
            await this.drain(lane)
            lane.streamed = true
            await this.emit(r)
        })
    }

    private serial(lane: LaneState, job: () => Promise<void>): Promise<void> {
        const next = lane.io.then(job)
        lane.io = next.catch(() => undefined)
        return next
    }

    private async drain(lane: LaneState): Promise<void> {
        while (lane.buffer.length > 0) {
            const r = lane.buffer.shift()!
            lane.bytes -= r.data.byteLength
            lane.streamed = true
            await this.emit(r)
        }
    }

    private async close(lane: LaneState): Promise<void> {
        if (this.cancelled) throw this.cancelled
        lane.closed = true
        lane.active = false
        if (this.head === lane) await this.advance()
    }

    /** The head has finished: flush every finished unit that follows, in order, and hand the head to the first one still running. */
    private async advance(): Promise<void> {
        for (;;) {
            const lane = this.head
            if (!lane) return
            if (!lane.closed) {
                // The unit that is the head now (running, or not started yet): its held packets go out first, then it streams.
                const w = lane.waiter
                lane.waiter = null
                await this.serial(lane, () => this.drain(lane))
                w?.resolve()
                return
            }
            await this.serial(lane, () => this.drain(lane))
            lane.flushed = true
            this.headIndex++
        }
    }

    private async abort(lane: LaneState, reason?: unknown): Promise<void> {
        const wasActive = lane.active
        lane.active = false
        lane.buffer = []
        lane.bytes = 0
        this.release(lane, reason ?? new LaneRestart())
        if (!wasActive) return
        if (lane.streamed) this.poison = reason ?? new Error('a unit that was already written into the file failed')
        // Units waiting for this one cannot carry on until it goes again: they stop and go after it.
        if (this.head === lane) for (const l of this.lanes.values()) if (l !== lane) this.release(l, new LaneRestart())
    }
}
