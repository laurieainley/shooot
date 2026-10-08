import type { MatchEvent } from '../types'
import { fileKey, fileKeys } from './fileKey'

export function relinkEvents(events: MatchEvent[], files: { name: string; file?: { size: number } }[]): MatchEvent[] {
    const keys = fileKeys(files)
    const plain = files.map((f) => fileKey(f.name))
    return events.map((e) => {
        if (e.globalTimeSec !== undefined) return e // not placed in a file yet (utils/matchClock.ts)
        if (e.sourceFileKey === undefined) {
            const key = keys[e.sourceFileIndex ?? 0]
            return key === undefined ? e : { ...e, sourceFileKey: key }
        }
        // A key saved before a same-named file was added is the plain name: it still finds the first such file.
        const found = keys.indexOf(e.sourceFileKey)
        const idx = found !== -1 ? found : plain.indexOf(e.sourceFileKey)
        if (idx === -1) return e.unlinked ? e : { ...e, unlinked: true }
        if (idx === e.sourceFileIndex && !e.unlinked) return e
        const next: MatchEvent = { ...e, sourceFileIndex: idx }
        delete next.unlinked
        return next
    })
}

export function linkedEvents(events: MatchEvent[]): MatchEvent[] {
    return events.filter((e) => !e.unlinked)
}
