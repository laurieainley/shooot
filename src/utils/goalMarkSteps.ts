import type { GoalMarks } from '../types'

export type MarkKey = 'postL' | 'postR' | 'barL' | 'barR' | 'backL' | 'backR'
export const MARK_STEPS: { key: MarkKey; optional: boolean; prompt: string }[] = [
    { key: 'postL', optional: false, prompt: 'the bottom of the left post' },
    { key: 'postR', optional: false, prompt: 'the bottom of the right post' },
    { key: 'barL', optional: false, prompt: 'the top of the left post' },
    { key: 'barR', optional: false, prompt: 'the top of the right post' },
    { key: 'backL', optional: true, prompt: 'the back-left corner of the net on the floor (optional)' },
    { key: 'backR', optional: true, prompt: 'the back-right corner of the net on the floor (optional)' },
]

/** The next point to place: the first one neither placed nor skipped; null when done. */
export function nextStep(partial: Partial<GoalMarks>, skipped: ReadonlySet<MarkKey>): MarkKey | null {
    return MARK_STEPS.find((s) => !partial[s.key] && !skipped.has(s.key))?.key ?? null
}

export function promptFor(key: MarkKey, touch: boolean): string {
    const s = MARK_STEPS.find((x) => x.key === key)!
    return `${touch ? 'Tap' : 'Click'} ${s.prompt}`
}

export function isComplete(partial: Partial<GoalMarks>): partial is GoalMarks {
    return !!(partial.postL && partial.postR && partial.barL && partial.barR)
}
