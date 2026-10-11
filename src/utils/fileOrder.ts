import type { PairedEntry } from './gopro'

/** What ordering needs to know about a file: its name and, when known, when it was recorded (ms since epoch). */
export type OrderInfo = { name: string; timeMs?: number }

/** Name order that reads digits as numbers (clip2 before clip10). */
export function naturalCompare(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)
}

const infoOf = <T>(e: PairedEntry<T>, info: (t: T) => OrderInfo): OrderInfo => info((e.full ?? e.proxy)!)

/**
 * Default timeline order for a batch of files. GoPro files (`key` set; already in chapter order from `pairFiles`) keep
 * that order. Everything else goes by recording time (container metadata, else lastModified, supplied as `timeMs`),
 * then by natural name order; files with no time come last. The two groups are merged by time when both have times.
 */
export function orderEntries<T>(entries: PairedEntry<T>[], info: (t: T) => OrderInfo): PairedEntry<T>[] {
    const gopro = entries.filter((e) => e.key !== null)
    const others = entries.filter((e) => e.key === null).sort((a, b) => {
        const x = infoOf(a, info)
        const y = infoOf(b, info)
        if (x.timeMs !== undefined && y.timeMs !== undefined && x.timeMs !== y.timeMs) return x.timeMs - y.timeMs
        if ((x.timeMs === undefined) !== (y.timeMs === undefined)) return x.timeMs === undefined ? 1 : -1
        return naturalCompare(x.name, y.name)
    })
    const out: PairedEntry<T>[] = []
    let g = 0
    let o = 0
    while (g < gopro.length || o < others.length) {
        const gt = g < gopro.length ? infoOf(gopro[g], info).timeMs : undefined
        const ot = o < others.length ? infoOf(others[o], info).timeMs : undefined
        const takeGopro = o >= others.length || (g < gopro.length && (gt === undefined || ot === undefined || gt <= ot))
        out.push(takeGopro ? gopro[g++] : others[o++])
    }
    return out
}

/** How the current file order compares with filming time, for the Files sheet. */
export type FilmingOrder =
    | { kind: 'single' }
    | { kind: 'unknown' }                                  // some file has no recording time: the user has to check by eye
    | { kind: 'in-order' }
    | { kind: 'out-of-order'; earlierThan: Map<number, number> } // file index → index of the file above it filmed later

export function filmingOrder(files: { recordedAtMs?: number }[]): FilmingOrder {
    if (files.length < 2) return { kind: 'single' }
    if (files.some((f) => f.recordedAtMs === undefined)) return { kind: 'unknown' }
    const earlierThan = new Map<number, number>()
    for (let i = 1; i < files.length; i++) {
        // Compare with the latest-filmed file above, so one misplaced file flags only itself.
        let latest = 0
        for (let j = 1; j < i; j++) if (files[j].recordedAtMs! > files[latest].recordedAtMs!) latest = j
        if (files[i].recordedAtMs! < files[latest].recordedAtMs!) earlierThan.set(i, latest)
    }
    return earlierThan.size ? { kind: 'out-of-order', earlierThan } : { kind: 'in-order' }
}

/** Files sorted by recording time (stable; only call when every file has one). */
export function sortByFilmingTime<T extends { recordedAtMs?: number }>(files: T[]): T[] {
    return files.map((f, i) => ({ f, i })).sort((a, b) => a.f.recordedAtMs! - b.f.recordedAtMs! || a.i - b.i).map(({ f }) => f)
}
