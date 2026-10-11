// A handle on the player's play / pause for UI outside Player (the review card, where the global shortcuts are off).
let toggle: (() => void) | null = null

export function registerPlayerToggle(fn: (() => void) | null): void { toggle = fn }
export function togglePlayerPlayback(): void { toggle?.() }
