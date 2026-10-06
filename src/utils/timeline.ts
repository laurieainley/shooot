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

/** A project of an hour or more shows every running time as h:mm:ss, so the width never changes mid-scrub. */
export function isLongTimeline(totalSec: number): boolean {
    return totalSec >= 3600
}

/**
 * A running clock of fixed shape: `mm:ss` with leading zeros, or `h:mm:ss` when the project is an hour or more
 * (`long`; also forced for any time past an hour). Pair with `clockWidthCh` for a stable box.
 */
export function formatClock(totalSeconds: number, long: boolean): string {
    const s = Math.max(0, Math.floor(totalSeconds))
    const hh = Math.floor(s / 3600)
    const mm = `${Math.floor((s % 3600) / 60)}`.padStart(2, '0')
    const ss = `${s % 60}`.padStart(2, '0')
    return long || hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Characters a running clock needs (plus one for the minus sign before kick-off when `signed`), for a `ch` min-width. */
export function clockWidthCh(long: boolean, signed: boolean): number {
    return (long ? 7 : 5) + (signed ? 1 : 0)
}

/** Event timecode: match clock from kick-off when a match start is set (− before it), else time in the file. */
export function formatEventClock(absSec: number, fileSec: number, matchStartSec: number, long = false): string {
    if (matchStartSec <= 0) return formatClock(fileSec, long)
    const rel = absSec - matchStartSec
    return rel < 0 ? `−${formatClock(-rel, long)}` : formatClock(rel, long)
}
