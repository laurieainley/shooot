import type { VideoSourceFile } from '../types'
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
        const useProxy = entry.proxy && (entry.proxy.meta.playable || !entry.full?.meta.playable)
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
            fullFile: useProxy ? entry.full?.file : undefined,
            playbackIssue: play.meta.playable ? undefined : play.meta.error,
        })
    }
    return { files, error }
}
