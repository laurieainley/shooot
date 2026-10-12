import { useEffect, useState } from 'react'
import { UNKNOWN_SUPPORT, type CodecSupport } from '../render/transcodeSupport'
import type { SourceInfo } from '../utils/outputQuality'

export type ReencodeSupport = { source: SourceInfo | null; support: CodecSupport }

/**
 * What the re-encoding export can do with this file in this browser: the footage's real size (from the file itself, since a
 * played proxy may be smaller), whether its codec can be decoded and whether H.264 can be encoded at 4K / 1080p.
 * `fallback` (the size the app already knows) is used until the file has been read, or if it cannot be.
 */
export function useReencodeSupport(file: File | undefined, fallback: SourceInfo | null): ReencodeSupport {
    const [probed, setProbed] = useState<{ file: File; source: SourceInfo; support: CodecSupport } | null>(null)
    useEffect(() => {
        if (!file) return
        let live = true
        void (async () => {
            try {
                const [{ openSource }, { probeSupport }] = await Promise.all([import('../render/sourceInput'), import('../render/transcodeSupport')])
                const o = await openSource({ name: file.name, file })
                try {
                    const source = { width: o.video.displayWidth, height: o.video.displayHeight }
                    const support = await probeSupport({ codec: o.config.codec, ...(o.config.description ? { description: o.config.description } : {}), width: source.width, height: source.height })
                    if (live) setProbed({ file, source, support })
                } finally {
                    o.input.dispose()
                }
            } catch { /* unreadable here: the render says why; keep the fallback */ }
        })()
        return () => { live = false }
    }, [file])
    if (probed && probed.file === file) return { source: probed.source, support: probed.support }
    return { source: fallback, support: UNKNOWN_SUPPORT }
}
