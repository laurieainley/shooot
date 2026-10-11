import { useSyncExternalStore } from 'react'

// A handle on the player's play / pause for UI outside Player (the review card, where the global shortcuts are off).
let toggle: (() => void) | null = null

/** Returns an unregister that only clears the handle if it is still this one. */
export function registerPlayerToggle(fn: () => void): () => void {
    toggle = fn
    return () => { if (toggle === fn) toggle = null }
}
export function togglePlayerPlayback(): void { toggle?.() }

// Paused state and step handle, published by Player for the review card (which sits over the global shortcuts).
let paused = true
const pausedListeners = new Set<() => void>()
export function setPlayerPaused(p: boolean): void {
    if (p === paused) return
    paused = p
    pausedListeners.forEach((l) => l())
}
export function isPlayerPaused(): boolean { return paused }
export function usePlayerPaused(): boolean {
    return useSyncExternalStore((cb) => { pausedListeners.add(cb); return () => { pausedListeners.delete(cb) } }, isPlayerPaused, isPlayerPaused)
}

export type PlayerStep = 'frame' | 'second'
let step: ((kind: PlayerStep, direction: 1 | -1) => void) | null = null
/** Returns an unregister that only clears the handle if it is still this one. */
export function registerPlayerStep(fn: (kind: PlayerStep, direction: 1 | -1) => void): () => void {
    step = fn
    return () => { if (step === fn) step = null }
}
/** Steps the player one frame (pausing it) or one second. */
export function stepPlayer(kind: PlayerStep, direction: 1 | -1): void { step?.(kind, direction) }

let seekPaused: ((fileIndex: number, timeSec: number) => void) | null = null
/** Returns an unregister that only clears the handle if it is still this one. */
export function registerPlayerSeekPaused(fn: (fileIndex: number, timeSec: number) => void): () => void {
    seekPaused = fn
    return () => { if (seekPaused === fn) seekPaused = null }
}
/** Seeks to a time in a file and leaves the player paused (scrubbing the review timeline). */
export function seekPlayerPaused(fileIndex: number, timeSec: number): void { seekPaused?.(fileIndex, timeSec) }
