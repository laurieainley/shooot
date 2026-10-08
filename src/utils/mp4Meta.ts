// Tiny reader for the one MP4 / MOV fact Mediabunny does not expose: when the clip was recorded (mvhd creation time).
// Phones and cameras write it in UTC; it is only used to order files, so any failure just means "unknown".

/** Seconds between 1904-01-01 (the MP4 epoch) and 1970-01-01. */
export const MAC_EPOCH_OFFSET_SEC = 2_082_844_800

const text = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])
const u32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

/** Creation time (ms since epoch) from the bytes of an `mvhd` box, or undefined when unset or not an mvhd. */
export function mvhdCreationMs(box: Uint8Array): number | undefined {
    if (box.length < 20 || text(box, 4) !== 'mvhd') return undefined
    const secs = box[8] === 1 ? (box.length >= 24 ? u32(box, 12) * 2 ** 32 + u32(box, 16) : 0) : u32(box, 12)
    if (secs === 0) return undefined
    return (secs - MAC_EPOCH_OFFSET_SEC) * 1000
}

export type BoxHeader = { type: string; size: number; header: number }

/** Parses a box header (at least 16 bytes where available). `remaining` = bytes from the box start to the end of the file. */
export function topLevelBox(bytes: Uint8Array, remaining: number): BoxHeader | null {
    if (bytes.length < 8) return null
    const size32 = u32(bytes, 0)
    const type = text(bytes, 4)
    if (size32 === 0) return { type, size: remaining, header: 8 }
    if (size32 === 1) {
        if (bytes.length < 16) return null
        return { type, size: u32(bytes, 8) * 2 ** 32 + u32(bytes, 12), header: 16 }
    }
    return size32 < 8 ? null : { type, size: size32, header: 8 }
}

/** When the clip was recorded, from the file's `moov/mvhd`; undefined when the file has none (or cannot be read). */
export async function readRecordingMs(file: Blob): Promise<number | undefined> {
    try {
        let pos = 0
        for (let n = 0; n < 64 && pos < file.size; n++) {
            const head = new Uint8Array(await file.slice(pos, pos + 16).arrayBuffer())
            const box = topLevelBox(head, file.size - pos)
            if (!box || box.size < box.header) return undefined
            if (box.type === 'moov') {
                const inner = new Uint8Array(await file.slice(pos + box.header, pos + box.header + 128).arrayBuffer())
                return mvhdCreationMs(inner)
            }
            pos += box.size
        }
    } catch { /* unreadable: unknown */ }
    return undefined
}
