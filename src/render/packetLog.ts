// A packet log: the encoded packets of one render unit (a card or a cut), appended to an OPFS file so an interrupted
// render can resume after the last finished unit. Record = 24-byte header + data:
//   u8 track (0 video, 1 audio) · u8 flags (1 = key) · u16 0 · u32 byte length · f64 timestamp · f64 duration (seconds)

export type LogRecord = { track: 0 | 1; key: boolean; timestamp: number; duration: number; data: Uint8Array }

export const RECORD_HEADER = 24

export function encodeRecord(r: LogRecord): Uint8Array {
    const out = new Uint8Array(RECORD_HEADER + r.data.byteLength)
    const v = new DataView(out.buffer)
    v.setUint8(0, r.track)
    v.setUint8(1, r.key ? 1 : 0)
    v.setUint32(4, r.data.byteLength, true)
    v.setFloat64(8, r.timestamp, true)
    v.setFloat64(16, r.duration, true)
    out.set(r.data, RECORD_HEADER)
    return out
}

/** Incremental reader: feed chunks in order, get whole records back. */
export class LogParser {
    private buf = new Uint8Array(0)

    /** Bytes held back waiting for the rest of a record. */
    get pending(): number {
        return this.buf.byteLength
    }

    push(chunk: Uint8Array): LogRecord[] {
        let data = chunk
        if (this.buf.byteLength > 0) {
            data = new Uint8Array(this.buf.byteLength + chunk.byteLength)
            data.set(this.buf)
            data.set(chunk, this.buf.byteLength)
        }
        const out: LogRecord[] = []
        const v = new DataView(data.buffer, data.byteOffset, data.byteLength)
        let o = 0
        while (data.byteLength - o >= RECORD_HEADER) {
            const len = v.getUint32(o + 4, true)
            if (data.byteLength - o < RECORD_HEADER + len) break
            out.push({
                track: v.getUint8(o) === 1 ? 1 : 0,
                key: (v.getUint8(o + 1) & 1) === 1,
                timestamp: v.getFloat64(o + 8, true),
                duration: v.getFloat64(o + 16, true),
                data: data.slice(o + RECORD_HEADER, o + RECORD_HEADER + len),
            })
            o += RECORD_HEADER + len
        }
        this.buf = data.slice(o)
        return out
    }
}
