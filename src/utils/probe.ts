export type ProbedMetadata = {
    durationSec?: number
    width?: number
    height?: number
    playable: boolean
    error?: string
}

// Heuristic H.264 support check (browser capability)
export function browserSupportsH264(): boolean {
    const v = document.createElement('video')
    const can = v.canPlayType('video/mp4; codecs="avc1.42E01E"') || v.canPlayType('video/mp4')
    return can !== ''
}

export async function probeVideoFile(file: File): Promise<ProbedMetadata> {
    if (!file.type.includes('mp4')) {
        return { playable: false, error: 'Only MP4 accepted in P0' }
    }
    if (!browserSupportsH264()) {
        return { playable: false, error: 'Browser cannot play MP4/H.264' }
    }

    const url = URL.createObjectURL(file)
    try {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.src = url
        const meta = await new Promise<ProbedMetadata>((resolve) => {
            const onLoaded = () => {
                resolve({
                    durationSec: isFinite(video.duration) ? video.duration : undefined,
                    width: video.videoWidth || undefined,
                    height: video.videoHeight || undefined,
                    playable: true,
                })
                cleanup()
            }
            const onError = () => {
                resolve({ playable: false, error: 'Failed to load metadata (unsupported codec?)' })
                cleanup()
            }
            const cleanup = () => {
                video.removeEventListener('loadedmetadata', onLoaded)
                video.removeEventListener('error', onError)
                URL.revokeObjectURL(url)
            }
            video.addEventListener('loadedmetadata', onLoaded)
            video.addEventListener('error', onError)
        })
        return meta
    } catch (e) {
        URL.revokeObjectURL(url)
        return { playable: false, error: 'Probe error' }
    }
}


