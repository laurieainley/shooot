const VIDEO_EXT = /\.(mp4|m4v|mov|lrv)$/i
const VIDEO_MIME = /mp4|quicktime|m4v/i

/** Picked-file extensions we accept: MP4 / M4V / MOV from phones and cameras, and .LRV proxies (some action cameras). */
export const VIDEO_EXTENSIONS: string[] = ['.mp4', '.MP4', '.m4v', '.M4V', '.mov', '.MOV', '.lrv', '.LRV']

// Extension-only on purpose: `video/*` makes recent Android Chrome open the
// Photo Picker, which hides USB storage (SD card readers).
export const FILE_INPUT_ACCEPT = VIDEO_EXTENSIONS.join(',')

export function isAcceptedVideo(name: string, mimeType: string): boolean {
    return VIDEO_MIME.test(mimeType) || VIDEO_EXT.test(name)
}

export interface PickerEnv {
    userAgent: string
    platform: string
    maxTouchPoints: number
}

/** iPhone / iPad, including iPadOS in desktop mode (reports MacIntel but has a touch screen). */
export function isIOS(env: PickerEnv): boolean {
    return /iPhone|iPad|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
}

/**
 * The `accept` value for video inputs. iOS maps extensions to uniform types and `.lrv` has none, so the picker
 * greys LRV files out: there the attribute is dropped ('') and `isAcceptedVideo` rejects wrong picks instead.
 */
export function fileInputAccept(env: PickerEnv): string {
    return isIOS(env) ? '' : FILE_INPUT_ACCEPT
}

function currentEnv(): PickerEnv {
    return typeof navigator === 'undefined'
        ? { userAgent: '', platform: '', maxTouchPoints: 0 }
        : { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints ?? 0 }
}

/** `accept` attribute for this device's video inputs (undefined = no attribute). */
export function acceptAttr(): string | undefined {
    return fileInputAccept(currentEnv()) || undefined
}

export function onIOS(): boolean {
    return isIOS(currentEnv())
}
