const VIDEO_EXT = /\.(mp4|lrv)$/i

// Extension-only on purpose: `video/*` makes recent Android Chrome open the
// Photo Picker, which hides USB storage (SD card readers).
export const FILE_INPUT_ACCEPT = '.mp4,.MP4,.lrv,.LRV'

export function isAcceptedVideo(name: string, mimeType: string): boolean {
    return mimeType.includes('mp4') || VIDEO_EXT.test(name)
}
