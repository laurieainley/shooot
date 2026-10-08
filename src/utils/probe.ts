import { ALL_FORMATS, Input } from 'mediabunny'
import { fileSource } from '../render/fileSource'
import { isAcceptedVideo } from './fileAccept'
import { codecStringVariants } from './codecSupport'
import { readRecordingMs } from './mp4Meta'
import { plausibleRecordingTime, unsupportedReason } from './footageSupport'

export type ProbedMetadata = {
    durationSec?: number
    width?: number
    height?: number
    codec?: 'h264' | 'hevc'
    /** True when the file has an audio track (AAC); renders fill silence for files without one. */
    hasAudio?: boolean
    /** When it was recorded, from the container's creation date (ms since epoch), if it has a plausible one. */
    recordedAtMs?: number
    accepted: boolean
    playable: boolean
    error?: string
}

type TrackInfo = Pick<ProbedMetadata, 'codec' | 'durationSec' | 'width' | 'height' | 'hasAudio' | 'recordedAtMs'> & {
    codecString?: string
    /** Raw Mediabunny codec names ('avc', 'hevc', 'prores', …); null = no such track. */
    videoCodec: string | null
    audioCodec: string | null
}

async function readTrackInfo(file: File): Promise<TrackInfo> {
    const input = new Input({ source: fileSource(file), formats: ALL_FORMATS })
    try {
        const v = await input.getPrimaryVideoTrack()
        const a = await input.getPrimaryAudioTrack()
        const audioCodec = a ? (a.codec ?? 'unknown') : null
        if (!v) return { videoCodec: null, audioCodec }
        const codec = v.codec === 'hevc' ? 'hevc' : v.codec === 'avc' ? 'h264' : undefined
        const tags = await input.getMetadataTags().catch(() => undefined)
        return {
            videoCodec: v.codec ?? 'unknown',
            audioCodec,
            codec,
            hasAudio: !!a,
            // Container tags when Mediabunny has a date (e.g. iPhone), else the movie header's creation time.
            recordedAtMs: plausibleRecordingTime(tags?.date) ?? plausibleRecordingTime(await readRecordingMs(file).then((ms) => (ms === undefined ? undefined : new Date(ms)))),
            codecString: (await v.getCodecParameterString()) ?? undefined,
            durationSec: await input.computeDuration(),
            width: v.displayWidth,
            height: v.displayHeight,
        }
    } finally {
        input.dispose()
    }
}

function loadsInVideoElement(file: File): Promise<boolean> {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    return new Promise<boolean>((resolve) => {
        const done = (ok: boolean): void => {
            // Abort the element's own fetch before revoking, or it reads a dead blob URL (console ERR_FILE_NOT_FOUND).
            video.removeAttribute('src')
            video.load()
            URL.revokeObjectURL(url)
            resolve(ok)
        }
        video.addEventListener('loadedmetadata', () => done(video.videoWidth > 0), { once: true })
        video.addEventListener('error', () => done(false), { once: true })
        video.src = url
    })
}

export async function probeVideoFile(file: File): Promise<ProbedMetadata> {
    if (!isAcceptedVideo(file.name, file.type)) {
        return { accepted: false, playable: false, error: `${file.name}: not an MP4, MOV or LRV video file` }
    }
    try {
        const { videoCodec, audioCodec, ...info } = await readTrackInfo(file)
        const reason = unsupportedReason(file.name, { videoCodec, audioCodec })
        if (reason || !info.codec) return { accepted: false, playable: false, error: reason ?? `${file.name}: no H.264/HEVC video track` }
        // canPlayType is only a hint (browsers disagree on hev1/hvc1 spellings and some answer '' for codecs they
        // play); actually loading the file decides. Log the hint for diagnosis.
        const v = document.createElement('video')
        const hinted = !info.codecString || codecStringVariants(info.codecString).some((c) => v.canPlayType(`video/mp4; codecs="${c}"`) !== '')
        const playable = await loadsInVideoElement(file)
        if (playable !== hinted) console.info(`[probe] ${file.name}: canPlayType=${hinted}, loads=${playable}`)
        return {
            ...info,
            accepted: true,
            playable,
            error: playable ? undefined : `Can't play ${info.codec.toUpperCase()} in this browser`,
        }
    } catch {
        return { accepted: false, playable: false, error: `${file.name}: could not read file` }
    }
}
