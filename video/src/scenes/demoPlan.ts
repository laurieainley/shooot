// The full demo's edit, laid out on the music's bar grid: every scene boundary is a bar (so swapping the track
// re-times the cut), the reveal's net impact lands on the drop and the final whistle on the final hit.
import { FPS } from '../brand'
import type { Grid, VoLine } from '../data/assets'
import { MOTIF_IMPACT } from '../motif/Motif'

export const SCENE_BARS = {
    hook: 0,
    moments: 2,
    problem: 4,
    chat: 7,
    why: 10,
    reveal: 14,
    film: 17,
    tag: 19,
    setup: 24,
    render: 26,
    full: 30,
    send: 33,
    montage: 35,
    end: 39,
} as const
export type SceneId = keyof typeof SCENE_BARS

export type VoCue = { line: VoLine; from: number; dur: number; index: number }

export type DemoPlan = {
    /** Scene start frames. */
    at: Record<SceneId, number>
    /** Scene lengths in frames. */
    len: Record<SceneId, number>
    total: number
    beat: number
    bar: number
    /** Absolute frames of every beat. */
    beats: number[]
    drop: number
    finalHit: number
    /** Frame where the end-card motif starts. */
    endMotif: number
    vo: VoCue[]
}

const fr = (s: number): number => Math.round(s * FPS)

/** VO cue points: [scene, beat offset within the scene]. */
const VO_AT: [SceneId, number][] = [
    ['moments', 0.5],
    ['problem', 0.5],
    ['why', 8],
    ['tag', 1],
    ['send', 0.5],
]

export function demoPlan(grid: Grid, vo: VoLine[]): DemoPlan {
    const barSec = (i: number): number => grid.bars[i] ?? grid.bars[grid.bars.length - 1] + (i - grid.bars.length + 1) * (240 / grid.bpm)
    const ids = Object.keys(SCENE_BARS) as SceneId[]
    const at = {} as Record<SceneId, number>
    for (const id of ids) at[id] = fr(barSec(SCENE_BARS[id]))
    // The reveal starts so the ball hits the net on the drop.
    const drop = fr(grid.drop)
    at.reveal = drop - MOTIF_IMPACT
    const finalHit = fr(grid.finalHit)
    const total = Math.max(finalHit + fr(1.6), fr(80))
    const len = {} as Record<SceneId, number>
    ids.forEach((id, i) => {
        const next = i + 1 < ids.length ? at[ids[i + 1]] : total
        len[id] = next - at[id]
    })
    const beat = (60 / grid.bpm) * FPS
    const cues: VoCue[] = vo.slice(0, VO_AT.length).map((line, i) => {
        const [scene, beats] = VO_AT[i]
        return { line, from: at[scene] + Math.round(beats * beat), dur: Math.round(line.durationSec * FPS), index: i }
    })
    // The end card: the ball hits the net two bars before the final whistle.
    const endMotif = finalHit - Math.round(8 * beat) - Math.round(MOTIF_IMPACT * 1.15)
    return { at, len, total, beat, bar: beat * 4, beats: grid.beats.map(fr), drop, finalHit, endMotif, vo: cues }
}
