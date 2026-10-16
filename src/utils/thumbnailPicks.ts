import type { CropRect, MatchEvent, Team } from '../types'
import { eventLabel, isMarker, shortNote } from './eventTypes'
import { finalWhistleSec, kickOffSec, matchMinute } from './matchClock'
import { clean, shortTitle } from './outputName'
import { linkedEvents } from './relink'

/** The ball crosses the line at the tagged moment; a thumbnail shows the shot slightly before it. */
export const THUMB_LEAD_SEC = 0.25
export const THUMB_FINE_MAX_SEC = 1
export const THUMB_FINE_STEP_SEC = 0.25

export type ThumbnailPick = {
    /** Stable key for the pick. */
    id: string
    event: MatchEvent | null
    fileIndex: number
    /** Seconds into that file for the default frame. */
    timeSec: number
    /** "3 of 12 · Goal · 34' Sam" */
    label: string
}

type FileInfo = { durationSec?: number }

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Frame time of a moment in its file: the moment minus the lead (plus any fine-tuning), kept inside the file. */
export function pickTime(matchTimeSec: number, durationSec: number | undefined, fine = 0): number {
    const t = Math.max(0, matchTimeSec - THUMB_LEAD_SEC + fine)
    return durationSec && durationSec > 0 ? clamp(t, 0, Math.max(0, durationSec - 0.1)) : t
}

/**
 * The frames to choose from, in time order: every tagged moment that is not a marker (goals, own goals, highlights,
 * saves, penalties, fouls), else a frame from the middle of the match.
 */
export function thumbnailPicks(events: MatchEvent[], offsets: number[], files: FileInfo[]): ThumbnailPick[] {
    if (files.length === 0) return []
    const linked = linkedEvents(events).filter((e) => e.globalTimeSec === undefined)
    const abs = (e: MatchEvent): number => (offsets[e.sourceFileIndex ?? 0] ?? 0) + e.matchTimeSec
    const chosen = linked.filter((e) => !isMarker(e) && (e.sourceFileIndex ?? 0) < files.length).sort((a, b) => abs(a) - abs(b))
    const kick = kickOffSec(linked, offsets)
    if (chosen.length > 0) {
        return chosen.map((e, i) => {
            const idx = e.sourceFileIndex ?? 0
            const who = e.scorer?.trim()
            const note = shortNote(e.notes, 30)
            return {
                id: e.id, event: e, fileIndex: idx, timeSec: pickTime(e.matchTimeSec, files[idx]?.durationSec),
                label: `${i + 1} of ${chosen.length} · ${eventLabel(e)} · ${matchMinute(abs(e), kick)}'${who ? ` ${who}` : ''}${note ? ` — ${note}` : ''}`,
            }
        })
    }
    // Nothing tagged: the middle of the match (kick off to final whistle when both are known, else the whole timeline).
    const last = files.length - 1
    const total = (offsets[last] ?? 0) + (files[last].durationSec ?? 0)
    const end = finalWhistleSec(linked, offsets)
    const mid = end !== null && end > kick ? (kick + end) / 2 : (kick + total) / 2
    let idx = 0
    offsets.forEach((o, i) => { if (i < files.length && o <= mid) idx = i })
    return [{ id: 'middle', event: null, fileIndex: idx, timeSec: pickTime(mid - (offsets[idx] ?? 0) + THUMB_LEAD_SEC, files[idx].durationSec), label: 'Middle of the match' }]
}

/** "Matchday 3 - Whites v Colours (highlights thumbnail).jpg": the reel's name without the score (it would give it away). */
export function thumbnailFileName(a: { kind: 'highlights' | 'fullMatch'; title: string | null; teams: Team[] }): string {
    const title = a.title?.trim() ? shortTitle(a.title) : ''
    const named = a.teams.length >= 2 && a.teams.slice(0, 2).every((t) => clean(t.name))
    const versus = named ? `${clean(a.teams[0].name)} v ${clean(a.teams[1].name)}` : ''
    const base = [title, versus].filter(Boolean).join(' - ') || 'Match'
    return `${base} (${a.kind === 'fullMatch' ? 'full match' : 'highlights'} thumbnail).jpg`
}

/** Where the picker opens: the first goal (so the opening frame is still a goal), else the first pick. */
export function defaultPickIndex(picks: ThumbnailPick[]): number {
    const i = picks.findIndex((p) => p.event?.type === 'goal' || p.event?.type === 'own_goal')
    return i < 0 ? 0 : i
}

/** How far the crop is moved from its starting place, in fractions of the source frame. */
export type CropPan = { x: number; y: number }
export const NO_PAN: CropPan = { x: 0, y: 0 }

/** `pan` limited so the crop (same size, moved) stays inside the frame. */
export function clampPan(crop: CropRect, pan: CropPan): CropPan {
    return {
        x: clamp(pan.x, -crop.x, 1 - crop.w - crop.x),
        y: clamp(pan.y, -crop.y, 1 - crop.h - crop.y),
    }
}

/** The crop moved by `pan` (clamped): same size, new position. */
export function panCrop(crop: CropRect, pan: CropPan): CropRect {
    const p = clampPan(crop, pan)
    return { ...crop, x: crop.x + p.x, y: crop.y + p.y }
}

/** The part of the frame, as fractions, that drawing `crop` cover-fitted into a 16:9 canvas shows (the crop trimmed to 16:9 about its centre). */
export function coverSpan(crop: CropRect, iw: number, ih: number, aspect = 16 / 9): { w: number; h: number } {
    const sw = crop.w * iw, sh = crop.h * ih
    return sw / sh > aspect ? { w: (sh * aspect) / iw, h: crop.h } : { w: crop.w, h: sw / aspect / ih }
}
