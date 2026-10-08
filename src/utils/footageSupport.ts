/** Which footage can be edited and rendered: H.264 / HEVC video, AAC audio (or none), in MP4 / MOV. */

const VIDEO_NAMES: Record<string, string> = {
    prores: 'ProRes', av1: 'AV1', vp9: 'VP9', vp8: 'VP8',
}
const AUDIO_NAMES: Record<string, string> = {
    opus: 'Opus', mp3: 'MP3', vorbis: 'Vorbis', flac: 'FLAC', ac3: 'AC-3', eac3: 'E-AC-3',
}

const label = (names: Record<string, string>, codec: string): string =>
    names[codec] ?? (codec.startsWith('pcm') ? 'PCM' : codec.toUpperCase())

/** A user-facing reason this file cannot be used, or null when it can. `null` codec = no such track. */
export function unsupportedReason(name: string, tracks: { videoCodec: string | null; audioCodec: string | null }): string | null {
    const { videoCodec, audioCodec } = tracks
    if (videoCodec === null) return `${name}: no H.264/HEVC video track`
    if (videoCodec !== 'avc' && videoCodec !== 'hevc') return `${name}: ${label(VIDEO_NAMES, videoCodec)} video is not supported (use H.264 or HEVC)`
    if (audioCodec !== null && audioCodec !== 'aac') return `${name}: ${label(AUDIO_NAMES, audioCodec)} audio is not supported (use AAC)`
    return null
}

/** Container creation date as ms, unless it is missing or one of the placeholder epochs cameras write when the clock was never set. */
export function plausibleRecordingTime(date: Date | undefined): number | undefined {
    if (!date) return undefined
    const ms = date.getTime()
    if (!Number.isFinite(ms) || ms < Date.UTC(1990, 0, 1)) return undefined
    return ms
}
