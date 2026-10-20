import type { ProbedMetadata } from './probe'
import type { PairSide, SourcePair, VideoSourceFile } from '../types'

/** Which file of a GoPro pair plays in the editor. Exports always use the MP4. */
export type PlaybackPref = 'lrv' | 'mp4'

/** LRV on touch layouts (phone / tablet: smooth and light on battery), MP4 with a mouse. */
export function defaultPlaybackPref(touch: boolean): PlaybackPref {
    return touch ? 'lrv' : 'mp4'
}

export function parsePlaybackPref(raw: unknown): PlaybackPref | null {
    return raw === 'lrv' || raw === 'mp4' ? raw : null
}

/** True when at least one file has both its MP4 and its LRV. */
export function hasPairs(files: Pick<VideoSourceFile, 'pair'>[]): boolean {
    return files.some((f) => f.pair)
}

export type SideChoice = { side: 'full' | 'proxy'; /** The MP4 was asked for but can't play here. */ fellBack: boolean }

/** The side to play for a preference; a side this browser can't play gives way to the other one. */
export function chooseSide(pair: SourcePair, pref: PlaybackPref): SideChoice {
    const want: 'full' | 'proxy' = pref === 'mp4' ? 'full' : 'proxy'
    const other = want === 'full' ? 'proxy' : 'full'
    if (!pair[want].playbackIssue || pair[other].playbackIssue) return { side: want, fellBack: false }
    return { side: other, fellBack: want === 'full' }
}

const playing = (f: VideoSourceFile, side: PairSide, kind: 'full' | 'proxy', url: string): VideoSourceFile => ({
    ...f,
    file: side.file, url, name: side.name, kind,
    width: side.width, height: side.height, codec: side.codec,
    playbackIssue: side.playbackIssue,
})

export type AppliedPlayback = { files: VideoSourceFile[]; changed: boolean; fellBack: boolean }

/**
 * Points every paired file at the side the preference asks for (unpaired files stay as they are). Keeps id, duration,
 * start time and the pair; `makeUrl` makes the new object URL and `revoke` frees one that is no longer needed.
 */
export function applyPlayback(
    files: VideoSourceFile[], pref: PlaybackPref,
    makeUrl: (f: File) => string, revoke: (url: string) => void,
): AppliedPlayback {
    let changed = false, fellBack = false
    const next = files.map((f) => {
        if (!f.pair) return f
        const choice = chooseSide(f.pair, pref)
        if (choice.fellBack) fellBack = true
        const side = f.pair[choice.side]
        if (side.file === f.file) return f
        changed = true
        if (f.url) revoke(f.url)
        return playing(f, side, choice.side, makeUrl(side.file))
    })
    return { files: changed ? next : files, changed, fellBack }
}

/** The player errored on the MP4 of a pair: play its LRV instead (and don't try the MP4 again). Null when there is no LRV to use. */
export function fallBackToLrv(f: VideoSourceFile, reason: string, makeUrl: (f: File) => string, revoke: (url: string) => void): VideoSourceFile | null {
    if (!f.pair || f.kind !== 'full' || f.pair.proxy.playbackIssue) return null
    if (f.url) revoke(f.url)
    const pair: SourcePair = { ...f.pair, full: { ...f.pair.full, playbackIssue: reason } }
    return { ...playing({ ...f, pair }, pair.proxy, 'proxy', makeUrl(pair.proxy.file)) }
}

/** What a pair keeps about one of its two files. */
export function sideOf(p: { name: string; file: File; meta: ProbedMetadata }): PairSide {
    return {
        file: p.file, name: p.name, width: p.meta.width, height: p.meta.height, codec: p.meta.codec,
        playbackIssue: p.meta.playable ? undefined : p.meta.error ?? "Can't play this file here",
    }
}

