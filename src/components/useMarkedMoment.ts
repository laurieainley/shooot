import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import { isPlayerPaused, togglePlayerPlayback, usePlayerPaused } from './playerControl'

export interface MarkedMoment {
    /** The marked time (whole timeline), or null while the user has not marked it. */
    markedSec: number | null
    /** Marks the playhead now (pauses if playing). Re-marking replaces it. */
    mark: () => void
    /** The user stepped a frame / second: the moment follows the playhead from here. */
    followPlayhead: () => void
    /** The user scrubbed: pause without marking, and stop following. */
    scrubbed: () => void
    /** Latest marked time, readable inside event handlers. */
    current: () => number | null
}

const playheadNow = (): number => {
    const s = useAppState.getState()
    return (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec
}

/**
 * The exact moment the user marks for one suggestion. Marked by M, by pausing after playing, or by stepping frames;
 * the brief pause after a seek never counts. A suggestion already saved starts from its saved moment (`savedSec`). While paused after such a mark it follows the playhead (stepping refines it).
 */
export function useMarkedMoment(suggestionId: string, savedSec: number | null = null): MarkedMoment {
    const paused = usePlayerPaused()
    const playheadSec = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const [stored, setStored] = useState<number | null>(null)
    const [following, setFollowing] = useState(false)
    const storedRef = useRef<number | null>(null)
    const followRef = useRef(false)
    const sawPlaying = useRef(false)
    const ignorePause = useRef(false)
    const set = (v: number | null, f: boolean): void => { storedRef.current = v; followRef.current = f; setStored(v); setFollowing(f) }

    // A suggestion already saved opens with its saved moment marked.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the suggestion changes
    useEffect(() => { sawPlaying.current = false; ignorePause.current = false; set(savedSec, false) }, [suggestionId])
    useEffect(() => {
        if (!paused) {
            sawPlaying.current = true
            if (followRef.current) set(storedRef.current, false) // playing again: keep the last mark
        } else if (sawPlaying.current) {
            if (ignorePause.current) ignorePause.current = false
            else set(playheadNow(), true)
        }
    }, [paused, suggestionId])
    // While following, the mark is the playhead (stepping moves it).
    useEffect(() => { if (following && paused) storedRef.current = playheadSec }, [following, paused, playheadSec])

    const markedSec = following && paused ? playheadSec : stored
    const current = useCallback((): number | null => (followRef.current && isPlayerPaused() ? playheadNow() : storedRef.current), [])
    const mark = useCallback((): void => {
        if (!isPlayerPaused()) { ignorePause.current = true; togglePlayerPlayback() }
        set(playheadNow(), true)
    }, [])
    const followPlayhead = useCallback((): void => { set(playheadNow(), true) }, [])
    const scrubbed = useCallback((): void => {
        if (followRef.current) set(storedRef.current, false)
        if (!isPlayerPaused()) { ignorePause.current = true; togglePlayerPlayback() }
    }, [])
    return { markedSec, mark, followPlayhead, scrubbed, current }
}
