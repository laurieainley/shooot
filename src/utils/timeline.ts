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


