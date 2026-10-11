// A handle on the player's play / pause for UI outside Player (the review card, where the global shortcuts are off).
let toggle: (() => void) | null = null

/** Returns an unregister that only clears the handle if it is still this one. */
export function registerPlayerToggle(fn: () => void): () => void {
    toggle = fn
    return () => { if (toggle === fn) toggle = null }
}
export function togglePlayerPlayback(): void { toggle?.() }
