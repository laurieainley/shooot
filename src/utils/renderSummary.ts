// Export drawer wording: the one-line size + time, the render button label, short reasons and one-line settings summaries. Pure.
import { formatBytes } from './fullMatch'
import { QUALITY_LABEL, type OutputQuality, type QualityOption } from './outputQuality'
import type { ScoreBugMode } from './scoreBug'

/** One time figure: the midpoint of the range for this device class in whole minutes ("under a minute" below one; "quick" for a stream copy). */
export function renderTimeText(range: [number, number] | null, seconds: number): string {
    if (range === null) return 'quick'
    const mid = (seconds * (range[0] + range[1])) / 2
    return mid < 60 ? 'under a minute' : `about ${Math.round(mid / 60)} min`
}

/**
 * "About 418 MB · about 5 min on this device" when the time was measured on this device (`basis: 'this device'`),
 * else "About 418 MB · about 5 min" (a typical figure for this kind of device).
 */
export function renderSummaryLine(o: { bytes: number; timeRange: [number, number] | null; seconds: number; basis?: 'typical' | 'this device' }): string {
    return `About ${formatBytes(o.bytes)} · ${renderTimeText(o.timeRange, o.seconds)}${o.basis === 'this device' ? ' on this device' : ''}`
}

/** The primary button: "Render highlights", "Render full match · 1080p". */
export function renderButtonLabel(noun: 'highlights' | 'full match', quality: OutputQuality): string {
    return `Render ${noun}${quality === 'original' ? '' : ` · ${QUALITY_LABEL[quality]}`}`
}

/** A few words for the line under a disabled quality option; the full reason stays in the title. Null when available. */
export function qualityShortReason(o: QualityOption): string | null {
    if (!o.disabled) return null
    if (o.noRoom) return 'too big'
    const r = o.reason ?? ''
    if (/not 4K/.test(r)) return 'needs 4K footage'
    if (/cannot (decode|encode)/.test(r)) return 'not on this device'
    if (/Load the match videos/.test(r)) return 'no footage'
    return 'unavailable'
}

export function clipsSummary(s: { before: number; after: number; replaySpeed: number }): string {
    return `${s.before} s before · ${s.after} s after · replays ${s.replaySpeed}×`
}

export function graphicsSummary(g: { cards: boolean; lowerThirds: boolean; replayTag: boolean }, themeName: string): string {
    const on = [g.cards && 'cards', g.lowerThirds && 'captions', g.replayTag && 'replay tag'].filter(Boolean)
    return `${themeName} · ${on.length > 0 ? on.join(', ') : 'no graphics'}`
}

export function fullMatchSummary(f: { cards: boolean; captions: boolean; replays: boolean; scoreBug: ScoreBugMode; intervalMin: number }): string {
    const on = [
        f.cards && 'cards', f.captions && 'captions', f.replays && 'replays',
        f.scoreBug === 'goals' ? 'score bug after goals' : f.scoreBug === 'periodic' ? `score bug every ${f.intervalMin} min` : false,
    ].filter(Boolean)
    return on.length > 0 ? on.join(', ') : 'nothing added'
}

/** One line on what each quality is (the "What's the difference?" list). */
export const QUALITY_EXPLANATION: Record<OutputQuality, string> = {
    original: 'The camera’s video, untouched; only replays and graphics are re-encoded. Largest file.',
    '4k': 'Re-encoded to H.264 4K, cut exactly at each clip.',
    '1080p': 'Re-encoded to H.264 1080p, cut exactly at each clip. Smallest file.',
}
