import type { VideoSourceFile } from '../types'

export function computeCumulativeOffsets(files: VideoSourceFile[]): number[] {
    const offsets: number[] = []
    let acc = 0
    for (let i = 0; i < files.length; i++) {
        offsets.push(acc)
        const d = files[i].durationSec ?? 0
        acc += d
    }
    return offsets
}

export function formatHMS(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds))
    const hh = Math.floor(s / 3600)
    const mm = Math.floor((s % 3600) / 60)
    const ss = s % 60
    return hh > 0
        ? `${`${hh}`.padStart(2, '0')}:${`${mm}`.padStart(2, '0')}:${`${ss}`.padStart(2, '0')}`
        : `${`${mm}`.padStart(2, '0')}:${`${ss}`.padStart(2, '0')}`
}



export function parseTimeToSeconds(input: string): number | null {
    const t = input.trim()
    if (!t) return null
    if (/^\d+$/.test(t)) return parseInt(t, 10)
    const parts = t.split(':')
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
    const nums = parts.map((p) => parseInt(p, 10))
    if (nums.slice(1).some((n) => n >= 60)) return null
    return nums.reduce((acc, n) => acc * 60 + n, 0)
}

/** Event timecode: match clock from kick-off when a match start is set (− before it), else time in the file. */
export function formatEventClock(absSec: number, fileSec: number, matchStartSec: number): string {
    if (matchStartSec <= 0) return formatHMS(fileSec)
    const rel = absSec - matchStartSec
    return rel < 0 ? `−${formatHMS(-rel)}` : formatHMS(rel)
}
