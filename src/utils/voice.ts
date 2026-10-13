/** The brand's voice for empty, loading and success states (BRAND.md). Errors and instructions stay plain; wit lives here only. */
export const REEL_READY = "Reel ready. Group chat won't know what's hit it."

export type EmptyLog = { lead: string; hint: string; key?: string; tail?: string }

/** The empty event log: the line, then what to do (touch: tap ＋; keyboard: press G). */
export function emptyLogLine(coarse: boolean, noFiles: boolean): EmptyLog {
    const lead = 'No goals yet. Classic.'
    if (coarse) return { lead, hint: noFiles ? 'Load a video, then tap ＋ while it plays.' : 'Tap ＋ while the video plays.' }
    return { lead, hint: noFiles ? 'Load a video, then press' : 'Press', key: 'G', tail: 'while it plays.' }
}

const pct = (fraction: number): number => Math.round(Math.min(1, Math.max(0, fraction)) * 100)

/** The progress line in the Export panel (the exact percentage sits in the status line under it). */
export const POLISHING = 'Polishing the tap-ins…'

/** The same, short enough for the top-bar chip, with the percentage. */
export function polishingChip(fraction: number): string {
    return `Polishing… ${pct(fraction)}%`
}

/** Find goals progress (brand voice). */
export function listeningLine(fraction: number): string {
    return `Listening for the roar… ${pct(fraction)}%`
}

/** Find goals phase 2 (Labs ball check) progress (brand voice). */
export const LOADING_BALL_MODEL = 'Loading the ball model…'
/** The 60 MB ball model is being fetched (plain: it is an instruction-free status, not a brand moment). */
export function downloadingModelLine(fraction: number): string {
    return `Downloading the ball model… ${pct(fraction)}%`
}
/** `ep` is the model's execution provider once it is ready; null = still loading. WASM is the slow fallback. */
export function checkingGoalsLine(fraction: number, ep: string | null = 'webgpu', topPicks = ''): string {
    if (ep === null) return LOADING_BALL_MODEL
    return `Checking the goal mouths… ${pct(fraction)}%${ep === 'wasm' ? ' (slow on this device)' : ''}${topPicks ? ` · ${topPicks}` : ''}`
}

export function ballSeenLine(n: number): string {
    return `Top picks: ${n}.`
}

export function keptSummary(kept: number, total: number): string {
    return `You kept ${kept} of ${total}.`
}

/** Find goals start form, above the button: what it does, in one line (the form below already says where to set the range). */
export const FIND_GOALS_INTRO = 'Listens to the match on this device to find likely goals, then you check each one.'

/** The Top picks lane when the ball check finished and saw the ball in no goal. */
export const NO_TOP_PICKS = "No top picks — the ball wasn't seen in a goal for any moment."
export const LOW_KEEP_NOTE = 'Detection struggled on this footage. Copy diagnostics and send it over.'
export const NOTHING_STOOD_OUT = 'Nothing stood out in the audio. Tag goals as you watch.'
