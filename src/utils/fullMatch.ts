// The full match export: every loaded file end to end, trimmed to kick-off … final whistle (stream copied).
import type { MatchEvent } from '../types'
import { CAPTION_DELAY_SEC, CAPTION_SEC } from '../graphics/layout'
import type { Cut } from '../render/types'
import { parseGoProName } from './gopro'
import { finalWhistleSec, kickOffSec } from './matchClock'
import { eventLabel } from './eventTypes'
import { REPLAY_GAIN, type ReplayOptions } from './renderPlan'
import { wantsReplay } from './replays'
import { formatHMS } from './timeline'

export type MatchSpan = { startSec: number; endSec: number; durationSec: number }

/** Kick-off … final whistle on the whole timeline; the start of the first file / the end of the last when not marked. */
export function fullMatchSpan(events: MatchEvent[], offsets: number[], durations: number[]): MatchSpan {
    const total = durations.reduce((a, b) => a + b, 0)
    const startSec = Math.min(total, Math.max(0, kickOffSec(events, offsets)))
    const endSec = Math.min(total, finalWhistleSec(events, offsets) ?? total)
    return { startSec, endSec, durationSec: Math.max(0, endSec - startSec) }
}

/** Cuts for `startSec` … `endSec` (whole timeline; null = to the end): kick-off → end of its file, whole middle files, start of the last → whistle. */
export function fullMatchCuts(durations: number[], startSec: number, endSec: number | null): Cut[] {
    const cuts: Cut[] = []
    let offset = 0
    durations.forEach((d, sourceIndex) => {
        const a = Math.max(startSec, offset)
        const b = Math.min(endSec ?? Infinity, offset + d)
        if (d > 0 && b > a) cuts.push({ sourceIndex, startSec: a - offset, endSec: b - offset })
        offset += d
    })
    return cuts
}

/** Seconds of live play after an event before its replay cuts in: the caption's delay plus its time on screen. */
export const LIVE_BEFORE_REPLAY_SEC = CAPTION_DELAY_SEC + CAPTION_SEC

/**
 * The match cuts with a slowed replay after each event that wants one (same rule, window, speed, gain and framing as
 * the highlights' replays). The live action plays on until the event's caption (or the score bug after a goal) has
 * been up and gone (`LIVE_BEFORE_REPLAY_SEC`, or the end of the replay window if later), then the replay, then play
 * resumes from there. A replay is clamped to the cut of its own file (never spans
 * files, never shows the warm-up before kick-off). Replay cuts carry `speed`; the match cuts stay stream-copied.
 */
export function withReplays(matchCuts: Cut[], events: MatchEvent[], offsets: number[], replay: ReplayOptions): Cut[] {
    type Insert = { cutIndex: number; at: number; order: number; cut: Cut }
    const inserts: Insert[] = []
    const wanted = events
        .filter(wantsReplay)
        .map((e) => ({ e, abs: (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec }))
        .sort((a, b) => a.abs - b.abs)
    wanted.forEach(({ e }, order) => {
        const file = e.sourceFileIndex ?? 0
        const t = e.matchTimeSec
        const cutIndex = matchCuts.findIndex((c) => c.sourceIndex === file && c.startSec <= t && t <= c.endSec)
        if (cutIndex === -1) return
        const c = matchCuts[cutIndex]
        const startSec = Math.max(c.startSec, t - replay.beforeSec)
        const endSec = Math.min(c.endSec, t + replay.afterSec)
        if (endSec <= startSec) return
        // ...but never past the next replayed event in the same file, which must play live before its own replay.
        const next = wanted[order + 1]
        const nextSec = next && (next.e.sourceFileIndex ?? 0) === file ? next.e.matchTimeSec : Infinity
        const crop = replay.cropFor?.(e) ?? null
        inserts.push({
            cutIndex, at: Math.max(endSec, Math.min(c.endSec, t + LIVE_BEFORE_REPLAY_SEC, nextSec)), order,
            cut: { sourceIndex: file, startSec, endSec, speed: replay.speed, gain: REPLAY_GAIN, ...(crop ? { crop, cropLabel: `Replay zoom: ${eventLabel(e)} ${formatHMS(t)}` } : {}) },
        })
    })
    if (inserts.length === 0) return matchCuts
    inserts.sort((a, b) => a.cutIndex - b.cutIndex || a.at - b.at || a.order - b.order)
    const out: Cut[] = []
    matchCuts.forEach((c, i) => {
        let from = c.startSec
        for (const ins of inserts.filter((x) => x.cutIndex === i)) {
            if (ins.at > from) out.push({ ...c, startSec: from, endSec: ins.at })
            from = Math.max(from, ins.at)
            out.push(ins.cut)
        }
        if (c.endSec > from) out.push({ ...c, startSec: from, endSec: c.endSec })
    })
    return out
}

/** Output size estimate: each file's bytes in proportion to the part of it that is used. */
export function estimateBytes(cuts: Cut[], sizes: number[], durations: number[]): number {
    return cuts.reduce((sum, c) => sum + (durations[c.sourceIndex] > 0 ? (sizes[c.sourceIndex] ?? 0) * (c.endSec - c.startSec) / durations[c.sourceIndex] : 0), 0)
}

export function formatBytes(bytes: number): string {
    const gb = bytes / 1024 ** 3
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${bytes > 0 ? Math.max(1, Math.round(bytes / 1024 ** 2)) : 0} MB`
}

/** Phones: warn before writing more than this. */
export const PHONE_SIZE_WARNING = 2 * 1024 ** 3

/**
 * Whole-timeline starts of files that begin a new recording: a GoPro file that is not the next chapter of the one
 * before it, or any join of other files. The camera was stopped there — usually half time.
 */
export function recordingGaps(files: { name: string }[], offsets: number[]): number[] {
    const gaps: number[] = []
    for (let i = 1; i < files.length; i++) {
        const a = parseGoProName(files[i - 1].name)
        const b = parseGoProName(files[i].name)
        const sameRecording = a && b && a.key.slice(2) === b.key.slice(2) && b.chapter === a.chapter + 1
        if (!sameRecording) gaps.push(offsets[i] ?? 0)
    }
    return gaps
}
