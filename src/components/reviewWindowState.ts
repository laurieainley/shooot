import type { LoopWindow } from '../utils/reviewLoop'

// The review loop window currently shown on the card (with the user's +2 s extensions), published for UI outside the card:
// a tag made while reviewing links to the suggestion only when it falls inside this window.
let current: LoopWindow | null = null
export function setReviewWindow(w: LoopWindow | null): void { current = w }
export function getReviewWindow(): LoopWindow | null { return current }
