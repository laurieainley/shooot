import type { MatchEvent, Team } from '../types'
import { linkedEvents } from './relink'
import { finalScore } from './score'

const TITLE_MAX = 25

/** Characters file systems refuse (and control characters) become spaces; runs of spaces collapse. */
export const clean = (s: string): string => Array.from(s, (ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim()

/** The title, cut at a word near 25 characters (with …) so the score stays visible in file lists. */
export function shortTitle(title: string): string {
    const t = clean(title)
    if (t.length <= TITLE_MAX) return t
    const cut = t.slice(0, TITLE_MAX)
    const space = cut.lastIndexOf(' ')
    return `${(space > TITLE_MAX * 0.6 ? cut.slice(0, space) : cut).trim()}…`
}

/**
 * The rendered file's name: "Matchday 3 - Whites 2-4 Colours.mp4" (title, then the final score in team order),
 * "… (full match)" for the full match and "… (preview)" for a preview render. Falls back to the plain kind name
 * when there is neither a title nor two named teams.
 */
export function outputFileName(a: { kind: 'highlights' | 'fullMatch'; preview: boolean; title: string | null; teams: Team[]; events: MatchEvent[] }): string {
    const title = a.title?.trim() ? shortTitle(a.title) : ''
    const named = a.teams.length >= 2 && a.teams.slice(0, 2).every((t) => clean(t.name))
    const [x, y] = named ? finalScore(linkedEvents(a.events), a.teams) : [0, 0]
    const score = named ? `${clean(a.teams[0].name)} ${x}-${y} ${clean(a.teams[1].name)}` : ''
    const base = [title, score].filter(Boolean).join(' - ') || (a.kind === 'fullMatch' ? 'Full match' : 'Highlights')
    const tags = [...(a.kind === 'fullMatch' && (title || score) ? ['full match'] : []), ...(a.preview ? ['preview'] : [])]
    return `${base}${tags.length ? ` (${tags.join(', ')})` : ''}.mp4`
}
