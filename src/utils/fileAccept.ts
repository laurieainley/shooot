const VIDEO_EXT = /\.(mp4|lrv)$/i

// Extension-only on purpose: `video/*` makes recent Android Chrome open the
// Photo Picker, which hides USB storage (SD card readers).
export const FILE_INPUT_ACCEPT = '.mp4,.MP4,.lrv,.LRV'

export function isAcceptedVideo(name: string, mimeType: string): boolean {
    return mimeType.includes('mp4') || VIDEO_EXT.test(name)
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
