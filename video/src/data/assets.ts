// Shared media (video/assets in the main checkout, symlinked to public/assets) and its metadata, loaded in
// calculateMetadata so every composition gets plain props. Anything missing falls back to a placeholder / default.
import { staticFile } from 'remotion'

export type Grid = { bpm: number; beats: number[]; bars: number[]; drop: number; finalHit: number; duration: number; placeholder: boolean }
export type VoLine = { file: string; text: string; durationSec: number }
export type Moment = { id: string; file: string; file4k?: string; eventOffsetSec: number; ballInNetSec: number; durationSec: number; note?: string }
export type CursorEvent = { t: number; x: number; y: number; type: string; key?: string; step?: string }
/** A screen recording of the editor and its log (t in video seconds). */
export type Capture = { file: string; events: CursorEvent[]; width: number }

/** Capture names the capture agent writes (assets/capture/<name>.mp4 + <name>.cursor.json). */
export const CAPTURE_NAMES = ['a-drop-files', 'b-tagging', 'b-tagging-2x', 'g-event-list-scorebug', 'e-export-render', 'f-fullmatch-description', 'c-scrub-montage', 'd-setup', 'd-match-setup', 'e-export', 'e-render', 'f-full-match', 'f-youtube', 'g-share', 'g-send']

export type Media = {
    track: 'a' | 'b'
    grid: Grid
    vo: VoLine[]
    moments: Record<string, Moment>
    captures: Record<string, Capture>
    reel?: { file: string; meta?: unknown }
    has: Record<string, boolean>
}

export const asset = (p: string): string => staticFile(`assets/${p}`)

async function json<T>(p: string): Promise<T | null> {
    try {
        const r = await fetch(asset(p))
        if (!r.ok) return null
        return (await r.json()) as T
    } catch {
        return null
    }
}

async function exists(p: string): Promise<boolean> {
    try {
        const r = await fetch(asset(p), { method: 'HEAD' })
        return r.ok
    } catch {
        return false
    }
}

export function fallbackGrid(bpm: number, duration = 80): Grid {
    const beat = 60 / bpm
    const beats: number[] = []
    for (let t = 0; t < duration; t += beat) beats.push(+t.toFixed(3))
    const bars = beats.filter((_, i) => i % 4 === 0)
    const drop = bars[15] ?? 28
    return { bpm, beats, bars, drop, finalHit: bars[bars.length - 1], duration, placeholder: true }
}

type MusicJson = { bpm: number; beatTimes: number[]; barTimes: number[]; dropSec: number; finalHitSec?: number; durationSec?: number; note?: string }

/** Default moments (the footage clips are 12 s windows); overridden by assets/footage/moments.json when present. */
const DEFAULT_MOMENTS: Record<string, Omit<Moment, 'id'>> = {
    sam: { file: 'footage/sam_l_goal.mp4', file4k: 'footage/sam_l_goal_4k.mp4', eventOffsetSec: 8, ballInNetSec: 8.1, durationSec: 12 },
    ryan: { file: 'footage/ryan_goal.mp4', file4k: 'footage/ryan_goal_4k.mp4', eventOffsetSec: 8, ballInNetSec: 8.1, durationSec: 12 },
    laurie: { file: 'footage/laurie_last_goal.mp4', file4k: 'footage/laurie_last_goal_4k.mp4', eventOffsetSec: 8, ballInNetSec: 8.1, durationSec: 12 },
    joe: { file: 'footage/joe_save.mp4', eventOffsetSec: 8, ballInNetSec: 8, durationSec: 12 },
    pen1: { file: 'footage/penalty_miss_1.mp4', eventOffsetSec: 8, ballInNetSec: 8, durationSec: 12 },
    pen2: { file: 'footage/penalty_miss_2.mp4', eventOffsetSec: 8, ballInNetSec: 8, durationSec: 12 },
    jak: { file: 'footage/jak_own_goal.mp4', eventOffsetSec: 8, ballInNetSec: 8.1, durationSec: 12 },
    kickoff: { file: 'footage/kickoff.mp4', eventOffsetSec: 6, ballInNetSec: 6, durationSec: 12 },
    walkon: { file: 'footage/walk_on.mp4', eventOffsetSec: 6, ballInNetSec: 6, durationSec: 12 },
    midfield: { file: 'footage/busy_midfield.mp4', eventOffsetSec: 6, ballInNetSec: 6, durationSec: 12 },
}

const ID_HINTS: [string, RegExp][] = [
    ['sam', /sam/i], ['ryan', /ryan/i], ['laurie', /laurie/i], ['joe', /joe|save/i], ['pen1', /pen\w*_?1|miss\w*_?1/i],
    ['pen2', /pen\w*_?2|miss\w*_?2/i], ['jak', /jak|own/i], ['kickoff', /kick/i], ['walkon', /walk/i], ['midfield', /mid/i],
]

type RawMoment = Record<string, unknown>

function normaliseMoments(raw: unknown): Record<string, Partial<Moment>> {
    const list: RawMoment[] = Array.isArray(raw)
        ? (raw as RawMoment[])
        : raw && typeof raw === 'object'
            ? Array.isArray((raw as { moments?: unknown }).moments)
                ? ((raw as { moments: RawMoment[] }).moments)
                : Object.entries(raw as Record<string, RawMoment>).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => ({ id: k, ...v }))
            : []
    const out: Record<string, Partial<Moment>> = {}
    for (const m of list) {
        const key = `${m.id ?? ''} ${m.name ?? ''} ${m.file ?? ''} ${m.clip ?? ''}`
        const hit = ID_HINTS.find(([, re]) => re.test(key))
        if (!hit) continue
        const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
        const file = (m.clip ?? m.file ?? m.path) as string | undefined
        const p: Partial<Moment> = {}
        if (file && /\.mp4$/i.test(file) && !/^G[XH]\d/.test(file)) p.file = file.startsWith('footage/') ? file : `footage/${file.replace(/^.*\//, '')}`
        if (typeof m.clip4k === 'string') p.file4k = `footage/${m.clip4k.replace(/^.*\//, '')}`
        const e = num(m.eventOffsetSec)
        const b = num(m.ballInNetSec) ?? num(m.keyMomentSec)
        if (e !== undefined) p.eventOffsetSec = e
        if (b !== undefined) p.ballInNetSec = b
        else if (e !== undefined) p.ballInNetSec = e - 0.5
        if (typeof m.description === 'string') p.note = m.description
        const prev = out[hit[0]]
        // Prefer the 1080p entry as `file`; remember a 4K one separately.
        if (p.file && /4k/i.test(p.file)) {
            out[hit[0]] = { ...p, ...prev, file4k: p.file }
        } else out[hit[0]] = { ...prev, ...p }
    }
    return out
}

export async function loadMedia(track: 'a' | 'b'): Promise<Media> {
    const music = await json<MusicJson>(`audio/music-${track}.json`)
    const grid: Grid = music
        ? {
            bpm: music.bpm, beats: music.beatTimes, bars: music.barTimes, drop: music.dropSec,
            finalHit: music.finalHitSec ?? music.barTimes[music.barTimes.length - 1], duration: music.durationSec ?? 80,
            placeholder: /placeholder/i.test(music.note ?? ''),
        }
        : fallbackGrid(track === 'a' ? 130 : 128)
    const voRaw = await json<VoLine[] | { lines: VoLine[] }>('audio/vo.json')
    const vo = (Array.isArray(voRaw) ? voRaw : voRaw?.lines ?? []).map((l) => ({ file: `audio/${l.file.replace(/^.*\//, '')}`, text: l.text, durationSec: l.durationSec }))
    const found = normaliseMoments(await json('footage/moments.json'))
    const moments: Record<string, Moment> = {}
    for (const [id, def] of Object.entries(DEFAULT_MOMENTS)) moments[id] = { id, ...def, ...found[id] } as Moment

    const captures: Record<string, Capture> = {}
    await Promise.all(CAPTURE_NAMES.map(async (n) => {
        if (!(await exists(`capture/${n}.mp4`))) return
        const log = await json<{ videoStartOffsetSec?: number; width?: number; events?: CursorEvent[] }>(`capture/${n}.cursor.json`)
        const off = log?.videoStartOffsetSec ?? 0
        captures[n] = { file: `capture/${n}.mp4`, width: log?.width ?? 1, events: (log?.events ?? []).map((e) => ({ ...e, t: e.t - off })) }
    }))

    const probe = [
        `audio/music-${track}.mp3`, `audio/music-${track}-loop18.mp3`,
        ...['ball-strike', 'crowd-ooh', 'crowd-roar', 'net-swish', 'rec-beep', 'shutter', 'ui-tick', 'whistle-final', 'whistle-short', 'whoosh'].map((s) => `audio/sfx-${s}.mp3`),
        ...vo.map((v) => v.file),
        ...Object.values(moments).flatMap((m) => [m.file, ...(m.file4k ? [m.file4k] : [])]),
        'reel/reel.mp4', 'reel/highlights.mp4',
    ]
    const has: Record<string, boolean> = {}
    await Promise.all(probe.map(async (p) => { has[p] = await exists(p) }))
    const reelFile = has['reel/reel.mp4'] ? 'reel/reel.mp4' : has['reel/highlights.mp4'] ? 'reel/highlights.mp4' : undefined
    return { track, grid, vo, moments, captures, reel: reelFile ? { file: reelFile } : undefined, has }
}
