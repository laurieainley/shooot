/** The browser APIs the match graphics (cards, captions, score bug) are encoded with. */
export interface CodecApis {
    VideoEncoder?: unknown
    VideoDecoder?: unknown
    VideoFrame?: unknown
    AudioEncoder?: unknown
    AudioDecoder?: unknown
    OffscreenCanvas?: unknown
}

export interface GraphicsSupport {
    ok: boolean
    missing: string[]
    /** Shown in the Export panel when graphics are not available. */
    message?: string
}

/**
 * Graphics are encoded in the browser with WebCodecs (Safari 17+, Chrome, Edge): video and audio encoders and an
 * OffscreenCanvas. Without them a plain reel still renders (stream copy needs none of this), just without graphics.
 */
export function graphicsSupport(g: CodecApis): GraphicsSupport {
    const missing: string[] = []
    if (typeof g.VideoEncoder === 'undefined' || typeof g.VideoDecoder === 'undefined' || typeof g.VideoFrame === 'undefined') missing.push('video encoding')
    if (typeof g.AudioEncoder === 'undefined' || typeof g.AudioDecoder === 'undefined') missing.push('audio encoding')
    if (typeof g.OffscreenCanvas === 'undefined') missing.push('off-screen drawing')
    if (missing.length === 0) return { ok: true, missing }
    return {
        ok: false,
        missing,
        message: `Match graphics need ${missing.join(' and ')}, which this browser does not have (Safari 17+, Chrome and Edge do). Your reel still renders without them.`,
    }
}
