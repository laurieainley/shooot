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
 * when there is neither a title nor two named teams. A clip names the teams ("Whites v Colours", no score) and adds
 * "- 13' Goal DJ" after the title and teams (falling back to "Clip").
 */
export function outputFileName(a: { kind: 'highlights' | 'fullMatch' | 'clip'; preview: boolean; title: string | null; teams: Team[]; events: MatchEvent[]; clip?: { minute: number | null; label: string; person?: string } }): string {
    const title = a.title?.trim() ? shortTitle(a.title) : ''
    const named = a.teams.length >= 2 && a.teams.slice(0, 2).every((t) => clean(t.name))
    const [x, y] = named ? finalScore(linkedEvents(a.events), a.teams) : [0, 0]
    // A clip's name never carries the score (it would spoil the clip); it names the two teams instead.
    const score = named ? (a.kind === 'clip' ? `${clean(a.teams[0].name)} v ${clean(a.teams[1].name)}` : `${clean(a.teams[0].name)} ${x}-${y} ${clean(a.teams[1].name)}`) : ''
    const fallback = a.kind === 'fullMatch' ? 'Full match' : a.kind === 'clip' ? 'Clip' : 'Highlights'
    const base = [title, score].filter(Boolean).join(' - ') || fallback
    const preview = a.preview ? ' (preview)' : ''
    if (a.kind === 'clip') {
        const c = a.clip
        const what = c ? [c.minute === null ? '' : `${c.minute}'`, clean(c.label), c.person ? clean(c.person) : ''].filter(Boolean).join(' ') : ''
        return `${[base, what].filter(Boolean).join(' - ')}${preview}.mp4`
    }
    const tags = [...(a.kind === 'fullMatch' && (title || score) ? ['full match'] : []), ...(a.preview ? ['preview'] : [])]
    return `${base}${tags.length ? ` (${tags.join(', ')})` : ''}.mp4`
}
