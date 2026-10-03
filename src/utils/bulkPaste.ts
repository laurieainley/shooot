import type { MatchEvent } from '../types'

let seq = 0

/** Parses one "MM:SS Team - Scorer" line (or plain seconds) into a goal in the given file. */
export function parseBulkLine(line: string, sourceFileIndex: number): MatchEvent | null {
    const t = line.trim()
    if (!t) return null
    const ts = t.match(/^(\d+):(\d{1,2})/) || t.match(/^(\d+)/)
    if (!ts) return null
    let seconds = 0
    if (ts.length === 3) {
        const mm = parseInt(ts[1], 10)
        const ss = parseInt(ts[2], 10)
        if (isNaN(mm) || isNaN(ss)) return null
        seconds = mm * 60 + ss
    } else {
        seconds = parseInt(ts[1], 10)
    }
    const rest = t.slice(ts[0].length).trim()
    let team: string | undefined
    let scorer: string | undefined
    if (rest) {
        const parts = rest.split(/[-–]|\s{2,}/)
        team = parts[0]?.trim() || undefined
        scorer = parts[1]?.trim() || undefined
    }
    seq += 1
    return { id: `${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 6)}`, matchTimeSec: seconds, team, scorer, sourceFileIndex, type: 'goal' }
}

export function parseBulkPaste(text: string, sourceFileIndex: number): MatchEvent[] {
    return text.split(/\r?\n/).map((l) => parseBulkLine(l, sourceFileIndex)).filter((e): e is MatchEvent => e !== null)
}
