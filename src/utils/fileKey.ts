import { parseGoProName } from './gopro'

// Stable identity for a source file across sessions and list changes.
// A camera's proxy files (GoPro .LRV) and their full videos share a key (chapter + recording number).
export function fileKey(name: string): string {
    return parseGoProName(name)?.key ?? name
}

/**
 * Keys for a whole timeline. Normally `fileKey(name)`; when several files share a key (phones number their clips
 * IMG_0001 each) the size and, if needed, the position among equals are added so events stay on the right file.
 */
export function fileKeys(files: { name: string; file?: { size: number } }[]): string[] {
    const base = files.map((f) => fileKey(f.name))
    const total = new Map<string, number>()
    for (const k of base) total.set(k, (total.get(k) ?? 0) + 1)
    const seen = new Map<string, number>()
    return files.map((f, i) => {
        if ((total.get(base[i]) ?? 0) < 2) return base[i]
        const sized = f.file ? `${base[i]}@${f.file.size}` : base[i]
        const n = (seen.get(sized) ?? 0) + 1
        seen.set(sized, n)
        return n === 1 ? sized : `${sized}#${n}`
    })
}
