import type { VideoSourceFile } from '../types'
import { chooseSide, sideOf, type PlaybackPref } from './playbackSource'
import { probeVideoFile, type ProbedMetadata } from './probe'
import { pairFiles } from './gopro'
import { orderEntries } from './fileOrder'

export type ProcessResult = {
    files: VideoSourceFile[]
    error: string | null
}

type Probed = { name: string; file: File; meta: ProbedMetadata }

export async function processVideoFiles(
    fileList: FileList | File[],
    probe: (f: File) => Promise<ProbedMetadata> = probeVideoFile,
    pref: PlaybackPref = 'lrv',
): Promise<ProcessResult> {
    const probed: Probed[] = []
    let error: string | null = null
    for (const f of Array.from(fileList)) {
        const meta = await probe(f)
        if (!meta.accepted) {
            error = meta.error ?? 'Unsupported file'
            continue
        }
        probed.push({ name: f.name, file: f, meta })
    }

    const files: VideoSourceFile[] = []
    // Default order: GoPro chapters, else recording time (container date, else lastModified), else name.
    const ordered = orderEntries(pairFiles(probed), (p) => ({ name: p.name, timeMs: p.meta.recordedAtMs ?? (p.file.lastModified || undefined) }))
    for (const [idx, entry] of ordered.entries()) {
        const pair = entry.proxy && entry.full ? { full: sideOf(entry.full), proxy: sideOf(entry.proxy) } : undefined
        const useProxy = pair
            ? chooseSide(pair, pref).side === 'proxy'
            : !!entry.proxy && (entry.proxy.meta.playable || !entry.full?.meta.playable)
        const play = (useProxy ? entry.proxy : entry.full)!
        files.push({
            id: `${Date.now()}-${idx}`,
            file: play.file,
            url: URL.createObjectURL(play.file),
            name: play.name,
            durationSec: play.meta.durationSec,
            width: play.meta.width,
            height: play.meta.height,
            kind: useProxy ? 'proxy' : 'full',
            codec: play.meta.codec,
            fullFile: entry.full && (useProxy || pair) ? entry.full.file : undefined,
            pair,
            playbackIssue: play.meta.playable ? undefined : play.meta.error,
            recordedAtMs: play.meta.recordedAtMs ?? (useProxy ? entry.full : entry.proxy)?.meta.recordedAtMs,
        })
    }
    return { files, error }
}
