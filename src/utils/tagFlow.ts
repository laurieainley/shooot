import { controlLabel, type PickerOption } from './eventTypes'
import type { PickerStep } from './eventPicker'
import { sortNames } from './roster'

/** The question the Tag column asks at a step. For person steps this is also the group's name ("Scorer", "Goalkeeper"). */
export function questionFor(step: PickerStep, option: PickerOption): string {
    switch (step) {
        case 'type': return 'What happened?'
        case 'team':
            if (option.id === 'own_goal') return 'Whose player put it in?'
            if (option.id === 'save') return 'Whose keeper?'
            if (option.type === 'goal') return 'Who scored?'
            return 'Which team?'
        case 'scorer': return option.id === 'save' ? 'Goalkeeper' : option.personLabel ?? 'Scorer'
        case 'assist': return 'Assist'
        case 'text': return option.textLabel ?? 'Note'
    }
}

/** The questions a type asks in the Tag column (not the optional note: touch skips it). */
export function tagSteps(option: PickerOption, hasTeams: boolean): PickerStep[] {
    const steps: PickerStep[] = ['type']
    if (option.marker || !option.askTeam || !hasTeams) return steps
    steps.push('team')
    if (option.askScorer) steps.push('scorer')
    if (option.askAssist) steps.push('assist')
    return steps
}

export interface Crumb {
    label: string
    /** The step this crumb goes back to; null for the time. */
    step: PickerStep | null
}

export interface CrumbInput {
    clock: string
    option?: PickerOption
    team?: string
    scorer?: string
    assist?: string
    step: PickerStep
    scorerSkipped?: boolean
}

/** "12:34 · Goal · Whites · DJ": each answer so far, tappable to change it. Only questions already behind the user show. */
export function breadcrumbs({ clock, option, team, scorer, step, scorerSkipped }: CrumbInput): Crumb[] {
    const crumbs: Crumb[] = [{ label: clock, step: null }]
    if (step === 'type' || !option) return crumbs
    crumbs.push({ label: option.label, step: 'type' })
    if (step === 'team') return crumbs
    if (team) crumbs.push({ label: team, step: 'team' })
    if (step === 'scorer') return crumbs
    if (scorer) crumbs.push({ label: scorer, step: 'scorer' })
    else if (scorerSkipped) crumbs.push({ label: 'No scorer', step: 'scorer' })
    return crumbs
}

/**
 * Names in the person grid: A–Z, then names added during this tag in the order added, so nothing reorders while tagging
 * (next time the new name is A–Z with the rest).
 */
export function orderNames(roster: readonly string[], added: readonly string[] = []): string[] {
    const addedKeys = added.map((n) => n.trim().toLowerCase())
    const inRoster = (n: string): boolean => roster.some((r) => r.trim().toLowerCase() === n.trim().toLowerCase())
    const rest = roster.filter((r) => !addedKeys.includes(r.trim().toLowerCase()))
    const tail = added.filter(inRoster).map((n) => roster.find((r) => r.trim().toLowerCase() === n.trim().toLowerCase()) as string)
    return [...sortNames(rest), ...tail]
}

/** Plain text for the duplicate-mark warning. */
export function nearWarning(near: { event: Parameters<typeof controlLabel>[0]; deltaSec: number }): string {
    const when = near.deltaSec === 0 ? 'at this same second' : `${Math.abs(near.deltaSec)} s ${near.deltaSec < 0 ? 'before' : 'after'} this`
    return `You tagged ${controlLabel(near.event)} ${when}. Cancel if that was a double tap.`
}
