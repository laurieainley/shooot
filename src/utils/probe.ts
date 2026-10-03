import { ALL_FORMATS, Input } from 'mediabunny'
import { fileSource } from '../render/fileSource'
import { isAcceptedVideo } from './fileAccept'

export type ProbedMetadata = {
    durationSec?: number
    width?: number
    height?: number
    codec?: 'h264' | 'hevc'
    accepted: boolean
    playable: boolean
    error?: string
}

async function readTrackInfo(file: File): Promise<Pick<ProbedMetadata, 'codec' | 'durationSec' | 'width' | 'height'> & { codecString?: string }> {
    const input = new Input({ source: fileSource(file), formats: ALL_FORMATS })
    try {
        const v = await input.getPrimaryVideoTrack()
        if (!v) return {}
        const codec = v.codec === 'hevc' ? 'hevc' : v.codec === 'avc' ? 'h264' : undefined
        return {
            codec,
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
            video.removeAttribute('src')
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
        return { accepted: false, playable: false, error: `${file.name}: not an MP4/LRV file` }
    }
    try {
        const info = await readTrackInfo(file)
        if (!info.codec) return { accepted: false, playable: false, error: `${file.name}: no H.264/HEVC video track` }
        const v = document.createElement('video')
        const canPlay = info.codecString ? v.canPlayType(`video/mp4; codecs="${info.codecString}"`) !== '' : true
        const playable = canPlay && (await loadsInVideoElement(file))
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
