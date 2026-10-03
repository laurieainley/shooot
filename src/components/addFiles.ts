import { useAppState } from '../state'
import { processVideoFiles } from '../utils/processFiles'
import { parseGoProName } from '../utils/gopro'

/**
 * Adds picked or dropped files to the timeline. Full-quality GoPro MP4s whose proxy (LRV) is already
 * loaded are attached to it for rendering; everything else is probed and appended. Returns an error message, if any.
 */
export async function addPickedFiles(picked: File[]): Promise<string | null> {
    if (picked.length === 0) return null
    const fulls = picked.filter((f) => parseGoProName(f.name)?.kind === 'full')
    const unmatched = new Set(useAppState.getState().attachFullFiles(fulls))
    const rest = picked.filter((f) => !fulls.includes(f) || unmatched.has(f.name))
    if (rest.length === 0) return null
    const result = await processVideoFiles(rest)
    if (result.files.length > 0) useAppState.getState().addFiles(result.files)
    return result.error ?? null
}
