import { useAppState } from '../state'
import type { PairSide, VideoSourceFile } from '../types'
import { processVideoFiles } from '../utils/processFiles'
import { sideOf } from '../utils/playbackSource'
import { probeVideoFile, type ProbedMetadata } from '../utils/probe'
import { parseGoProName } from '../utils/gopro'
import { currentPlaybackPref, MP4_FALLBACK_TOAST } from './playbackPref'
import { showToast } from '../toasts'
import { openingLabel } from '../utils/opening'

/** Probe picked files, showing "Opening <name> (<size>)…" in the store while each one is read. */
async function openFiles(files: File[]): Promise<{ files: VideoSourceFile[]; error: string | null }> {
    const { setOpening } = useAppState.getState()
    let n = 0
    const probe = (f: File): Promise<ProbedMetadata> => {
        n++
        setOpening(openingLabel(f.name, f.size, files.length - n))
        return probeVideoFile(f)
    }
    if (files[0]) setOpening(openingLabel(files[0].name, files[0].size, files.length - 1))
    try {
        return await processVideoFiles(files, probe, currentPlaybackPref())
    } catch (e) {
        return { files: [], error: e instanceof Error ? e.message : String(e) }
    } finally {
        setOpening(null)
    }
}

/**
 * Adds picked or dropped files to the timeline. Full-quality videos whose proxy (a GoPro .LRV preview) is already
 * loaded are attached to it for rendering; everything else is probed and appended. Returns an error message, if any.
 */
export async function addPickedFiles(picked: File[]): Promise<string | null> {
    if (picked.length === 0) return null
    const fulls = picked.filter((f) => parseGoProName(f.name)?.kind === 'full')
    // A full file picked after its LRV is probed so the pair can play either one.
    const sides = new Map<File, PairSide>()
    const loadedKeys = new Set(useAppState.getState().files.filter((e) => e.kind === 'proxy').map((e) => parseGoProName(e.name)?.key))
    for (const f of fulls.filter((e) => loadedKeys.has(parseGoProName(e.name)?.key))) {
        try {
            const meta = await probeVideoFile(f)
            if (meta.accepted) sides.set(f, sideOf({ name: f.name, file: f, meta }))
        } catch { /* attached for export only, as before */ }
    }
    const unmatched = new Set(useAppState.getState().attachFullFiles(fulls, sides))
    if (currentPlaybackPref() === 'mp4') useAppState.getState().applyPlayback('mp4')
    const rest = picked.filter((f) => !fulls.includes(f) || unmatched.has(f.name))
    if (rest.length === 0) return null
    const result = await openFiles(rest)
    if (result.files.length > 0) {
        useAppState.getState().addFiles(result.files)
        if (currentPlaybackPref() === 'mp4' && result.files.some((f) => f.pair && f.kind === 'proxy' && f.pair.full.playbackIssue)) showToast(MP4_FALLBACK_TOAST)
    }
    return result.error ?? null
}

/** Replaces the file at `index` with the picked file(s). Returns an error message, if any. */
export async function replacePickedFile(index: number, picked: File[]): Promise<string | null> {
    if (picked.length === 0) return null
    const result = await openFiles(picked)
    if (result.files.length > 0) useAppState.getState().replaceFile(index, result.files)
    return result.error ?? null
}
