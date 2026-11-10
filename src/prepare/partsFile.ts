// Words and small rules around the prepared parts file (`.shooot-parts`): its name, when loading one asks before replacing the open
// project, and what a load says afterwards. The file format itself is bundle.ts.
import type { MatchEvent, Team } from '../types'
import { clean, shortTitle } from '../utils/outputName'
import type { BundleImport } from './bundle'

export const PARTS_EXT = '.shooot-parts'

export const isPartsFileName = (name: string): boolean => name.toLowerCase().endsWith(PARTS_EXT)

/** "Matchday 3 - Whites v Colours · prepared parts.shooot-parts" (no score: the name is seen on the card). */
export function partsFileName(a: { title: string | null; teams: Team[] }): string {
    const title = a.title?.trim() ? shortTitle(a.title) : ''
    const named = a.teams.length >= 2 && a.teams.slice(0, 2).every((t) => clean(t.name))
    const versus = named ? `${clean(a.teams[0].name)} v ${clean(a.teams[1].name)}` : ''
    return `${[title, versus].filter(Boolean).join(' - ') || 'Match'} · prepared parts${PARTS_EXT}`
}

/** Same rule as importing a project file: ask only when both sides have events (and here: when they are not the same events). */
export function needsReplace(existing: MatchEvent[], incoming: MatchEvent[]): boolean {
    return existing.length > 0 && incoming.length > 0 && JSON.stringify(existing) !== JSON.stringify(incoming)
}

const parts = (n: number): string => `${n} part${n === 1 ? '' : 's'}`
const were = (n: number): string => (n === 1 ? 'was' : 'were')

/** "3 parts were damaged and will be encoded here." (null when nothing was skipped). */
export function skippedNote(s: BundleImport['skipped']): string | null {
    const out: string[] = []
    if (s.space > 0) out.push(`${parts(s.space)} did not fit in this browser’s storage and will be encoded here.`)
    if (s.damaged > 0) out.push(`${parts(s.damaged)} ${were(s.damaged)} damaged and will be encoded here.`)
    if (s.failed > 0) out.push(`${parts(s.failed)} could not be stored and will be encoded here.`)
    return out.length > 0 ? out.join(' ') : null
}

/** The toast for a load (parts loaded) and the note that stays on screen until dismissed (refused, skipped, stopped, empty). */
export function loadOutcome(r: BundleImport): { toast: string | null; notice: string | null } {
    if (r.refused) return { toast: null, notice: r.refused }
    if (r.cancelled) return { toast: null, notice: `Loading stopped: ${parts(r.imported).replace('part', 'prepared part')} ${were(r.imported)} loaded, the rest will be encoded here.` }
    const skipped = skippedNote(r.skipped)
    if (r.imported === 0) return { toast: null, notice: skipped ?? 'This file has no prepared parts in it.' }
    return { toast: `Loaded ${parts(r.imported).replace('part', 'prepared part')} from ${r.device}`, notice: skipped }
}
