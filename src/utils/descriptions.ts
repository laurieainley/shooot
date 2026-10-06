// YouTube descriptions for the two exports: final score, chapters, goalscorers — blocks separated by blank lines.
import type { MatchEvent, Team } from '../types'
import { highlightChapterLines, matchChapterLines } from './chapters'
import { goalscorers } from './goalscorers'
import { finalWhistleSec, kickOffSec } from './matchClock'
import { linkedEvents } from './relink'
import type { ReplayOptions } from './renderPlan'

type DescriptionArgs = {
    events: MatchEvent[]
    teams: Team[]
    cumulativeOffsets: number[]
    before: number
    after: number
    replay?: ReplayOptions
    /** Length of the title card at the start of the video (0 without cards). */
    introSec: number
}

function compose(blocks: string[][]): string {
    return blocks.filter((b) => b.length > 0).map((b) => b.join('\n')).join('\n\n')
}

export function highlightsDescription(a: DescriptionArgs): string {
    const linked = linkedEvents(a.events)
    const { scoreLine, lines } = goalscorers(linked, a.teams)
    const chapters = highlightChapterLines(linked, a.cumulativeOffsets, a.before, a.after, a.teams.map((t) => t.name), a.replay, a.introSec)
    return compose([scoreLine ? [scoreLine] : [], chapters, lines])
}

export function fullMatchDescription(a: DescriptionArgs): string {
    const linked = linkedEvents(a.events)
    const { scoreLine, lines } = goalscorers(linked, a.teams)
    const start = kickOffSec(linked, a.cumulativeOffsets)
    const end = finalWhistleSec(linked, a.cumulativeOffsets)
    const chapters = matchChapterLines(linked, a.cumulativeOffsets, start, end, a.before, a.teams.map((t) => t.name), a.introSec)
    return compose([scoreLine ? [scoreLine] : [], chapters, lines])
}
