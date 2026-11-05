import { useSyncExternalStore } from 'react'
import type { ShortcutAction } from '../utils/shortcuts'

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
/** Pauses the player if it is playing (never starts it). */
export function pausePlayer(): void { if (!paused) toggle?.() }
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

let runShortcut: ((action: ShortcutAction) => void) | null = null
/** Returns an unregister that only clears the handle if it is still this one. */
export function registerPlayerShortcut(fn: (action: ShortcutAction) => void): () => void {
    runShortcut = fn
    return () => { if (runShortcut === fn) runShortcut = null }
}
/** Runs a player shortcut (seek, speed…) for UI that owns the keyboard, like the review card. */
export function runPlayerShortcut(action: ShortcutAction): void { runShortcut?.(action) }

// Playback speed for the touch view's ⋯ menu (the speed buttons over the picture are gone there).
let rateHandle: { get: () => number; set: (rate: number) => void } | null = null
export function registerPlayerRate(get: () => number, set: (rate: number) => void): () => void {
    const h = { get, set }
    rateHandle = h
    return () => { if (rateHandle === h) rateHandle = null }
}
export const getPlayerRate = (): number => rateHandle?.get() ?? 1
export function setPlayerRate(rate: number): void { rateHandle?.set(rate) }

/** The speeds offered by the speed button and the ⋯ menu. */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2]
/** "1×", "0.5×", "1.25×": a playback rate as written on the speed button. */
export const rateLabel = (rate: number): string => `${Number(rate.toFixed(2))}×`

// The current rate, published by Player on every ratechange (keys and the ⋯ menu change it too) so a button can show it.
let publishedRate = 1
const rateListeners = new Set<() => void>()
export function publishPlayerRate(rate: number): void {
    if (rate === publishedRate) return
    publishedRate = rate
    rateListeners.forEach((l) => l())
}
export function usePlayerRate(): number {
    return useSyncExternalStore((cb) => { rateListeners.add(cb); return () => { rateListeners.delete(cb) } }, () => publishedRate, () => publishedRate)
}
