import type { VideoSourceFile } from '../types'
import { probeVideoFile } from './probe'

export type ProcessResult = {
    files: VideoSourceFile[]
    error: string | null
}

export async function processVideoFiles(fileList: FileList): Promise<ProcessResult> {
    const files: VideoSourceFile[] = []
    let error: string | null = null
    for (const [idx, f] of Array.from(fileList).entries()) {
        const meta = await probeVideoFile(f)
        if (!meta.playable) {
            error = meta.error || 'Unsupported file'
            continue
        }
        files.push({
            id: `${Date.now()}-${idx}`,
            file: f,
            url: URL.createObjectURL(f),
            name: f.name,
            durationSec: meta.durationSec,
            width: meta.width,
            height: meta.height,
        })
    }
    return { files, error }
}
