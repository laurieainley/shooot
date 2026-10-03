import type { MatchEvent } from '../types'
import { fileKey } from './fileKey'

export function relinkEvents(events: MatchEvent[], files: { name: string }[]): MatchEvent[] {
    const keys = files.map((f) => fileKey(f.name))
    return events.map((e) => {
        if (e.sourceFileKey === undefined) {
            const key = keys[e.sourceFileIndex ?? 0]
            return key === undefined ? e : { ...e, sourceFileKey: key }
        }
        const idx = keys.indexOf(e.sourceFileKey)
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
