import { describe, it, expect } from 'vitest'
import { generateYouTubeChapters, generateHighlightChapters, matchChapterLines } from './chapters'
import type { MatchEvent, Team } from '../types'

const TEAMS: Team[] = [{ name: 'Whites', color: '#fff', roster: [], initials: 'whi' }, { name: 'Colours', color: '#f00', roster: [] }]

function goal(id: string, matchTimeSec: number, team?: string, scorer?: string, sourceFileIndex = 0): MatchEvent {
  return { id, matchTimeSec, team, scorer, sourceFileIndex, type: 'goal' as const }
}

describe('generateYouTubeChapters', () => {
  it('should include a Start line at 00:00', () => {
    const output = generateYouTubeChapters([goal('a', 60)])
    expect(output).toContain('00:00 Start')
  })

  it('should timestamp a goal offset by lengthBeforeGoalSec', () => {
    // goal at 60s, default lengthBeforeGoalSec=10 → chapter at 50s → 00:50
    const output = generateYouTubeChapters([goal('a', 60)], [0], 0, 10, 4)
    expect(output).toContain('00:50 Goal')
  })

  it('should include running score when goals have teams', () => {
    // Teams are sorted alphabetically: Blue, Red
    // Red scores → Blue:0, Red:1 → score string "0-1"
    // Blue scores → Blue:1, Red:1 → score string "1-1"
    const goals = [goal('a', 60, 'Red'), goal('b', 120, 'Blue')]
    const output = generateYouTubeChapters(goals, [0], 0, 10, 4)
    expect(output).toContain('Goal 0-1 (Red)')
    expect(output).toContain('Goal 1-1 (Blue)')
  })

  it('should include scorer name when provided', () => {
    const output = generateYouTubeChapters([goal('a', 60, 'Red', 'Smith')], [0], 0, 10, 4)
    expect(output).toContain('Smith')
  })

  it('should prepend final score header when teams are present', () => {
    const goals = [goal('a', 60, 'Red'), goal('b', 120, 'Blue')]
    const output = generateYouTubeChapters(goals, [0], 0, 10, 4)
    // Final score: Blue 1 - 1 Red (alphabetical team order)
    const lines = output.split('\n')
    expect(lines[0]).toMatch(/Blue \d+-\d+ Red|Red \d+-\d+ Blue/)
  })

  it('should sort goals by absolute time across multiple files', () => {
    // file 0 offset=0, file 1 offset=100
    // goal in file 1 at t=20 → abs=120; goal in file 0 at t=60 → abs=60
    const goals = [goal('late', 20, undefined, undefined, 1), goal('early', 60, undefined, undefined, 0)]
    const output = generateYouTubeChapters(goals, [0, 100], 0, 0, 0)
    const lines = output.split('\n').filter(l => l.includes('Goal'))
    // 'early' (abs 60) should appear before 'late' (abs 120)
    expect(lines[0]).toContain('01:00') // 60s
    expect(lines[1]).toContain('02:00') // 120s
  })
})

describe('generateHighlightChapters', () => {
  it('should return Start for empty goals', () => {
    expect(generateHighlightChapters([])).toBe('00:00 Start')
  })

  it('should space chapters by segmentLength + 1 second buffer', () => {
    const goals = [goal('a', 60), goal('b', 200)]
    // segmentLength = 10 + 4 = 14; second goal starts at 15s
    const output = generateHighlightChapters(goals, [0], 10, 4)
    const lines = output.split('\n').filter(l => l.includes('Goal'))
    expect(lines[0]).toContain('00:00')
    expect(lines[1]).toContain('00:15')
  })

  it('should include running score and team info', () => {
    // Teams sorted alphabetically: Away, Home
    // Home scores → Away:0, Home:1 → "0-1"
    // Away scores → Away:1, Home:1 → "1-1"
    const goals = [goal('a', 60, 'Home'), goal('b', 200, 'Away')]
    const output = generateHighlightChapters(goals, [0], 10, 4)
    expect(output).toContain('Goal 0-1 (Home)')
    expect(output).toContain('Goal 1-1 (Away)')
  })
})

describe('generateYouTubeChapters — event types', () => {
    const e = (id: string, t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'goal', ...extra })

    it('should label penalties, own goals and non-scoring events', () => {
        const events = [
            e('a', 60, { pen: true, team: 'Whites', scorer: 'Sam' }),
            e('b', 120, { type: 'highlight' }),
            e('c', 180, { type: 'own_goal', team: 'Colours', scorer: 'Alex' }),
            e('d', 240, { type: 'penalty_missed', team: 'Whites', scorer: 'Jo' }),
        ]
        const out = generateYouTubeChapters(events, [0], 0, 10, 4, TEAMS)
        expect(out.split('\n')[0]).toBe('WHI 1-1 CO')
        expect(out).toContain('00:50 Goal (pen) 1-0 (WHI) Sam')
        expect(out).toContain('01:50 Highlight')
        expect(out).toContain('02:50 Own goal 1-1 (CO) Alex')
        expect(out).toContain('03:50 Penalty missed (WHI) Jo')
    })

    it('should label a conceded penalty with the conceding team and person, without changing the score', () => {
        const events = [
            e('a', 60, { type: 'penalty_conceded', team: 'Colours', scorer: 'Ade', notes: 'Late tackle' }),
        ]
        const out = generateYouTubeChapters(events, [0], 0, 10, 4, TEAMS)
        expect(out.split('\n')[0]).toBe('WHI 0-0 CO')
        expect(out).toContain('00:50 Penalty conceded (CO) Ade')
        expect(out).toContain('Late tackle')
    })
})

describe('chapters — notes', () => {
    const e = (id: string, t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'highlight', ...extra })

    it('should add a note on a goal and on a save', () => {
        const events = [
            e('a', 100, { type: 'goal', team: 'Whites', scorer: 'Sam', notes: 'top corner' }),
            e('b', 200, { type: 'save', team: 'Colours', scorer: 'Jo', notes: 'point blank' }),
        ]
        const out = generateYouTubeChapters(events, [0], 0, 0, 4, TEAMS)
        expect(out).toContain('01:40 Goal 1-0 (WHI) Sam: top corner')
        expect(out).toContain('03:20 Save (CO) Jo: point blank')
    })

    it('should add a shortened note after the person', () => {
        const events = [
            e('a', 734, { team: 'Whites', scorer: 'Sam', notes: 'nutmeg on the wing' }),
            e('b', 800, { type: 'foul', team: 'Colours', notes: 'late tackle' }),
            e('c', 900, { notes: 'a very long description of a mazy run beating four defenders before shooting wide' }),
        ]
        const out = generateYouTubeChapters(events, [0], 0, 0, 4, TEAMS)
        expect(out).toContain('12:14 Highlight (WHI) Sam: nutmeg on the wing')
        expect(out).toContain('13:20 Foul (CO): late tackle')
        expect(out).toContain('15:00 Highlight: a very long description of a mazy run…')
        expect(generateHighlightChapters(events, [0], 10, 4, TEAMS)).toContain('00:00 Highlight (WHI) Sam: nutmeg on the wing')
    })
})

describe('generateHighlightChapters — event types', () => {
    it('should not advance the score for non-scoring events', () => {
        const events: MatchEvent[] = [
            { id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'save', team: 'Colours', scorer: 'Jo' },
            { id: 'b', matchTimeSec: 120, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
        ]
        const out = generateHighlightChapters(events, [0], 10, 4, TEAMS)
        expect(out).toContain('00:00 Save (CO) Jo')
        expect(out).toContain('00:15 Goal 1-0 (WHI)')
    })
})

describe('generateHighlightChapters — replays', () => {
  it('should push later chapters back by each earlier replay', () => {
    const events: MatchEvent[] = [
      { id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
      { id: 'b', matchTimeSec: 120, sourceFileIndex: 0, type: 'highlight' },
      { id: 'c', matchTimeSec: 180, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
    ]
    const out = generateHighlightChapters(events, [0], 10, 4, TEAMS, { beforeSec: 3, afterSec: 1, speed: 0.5 })
    // segment = 14 s + 1 s buffer; goal a adds a 8 s replay
    expect(out).toContain('00:00 Goal 1-0 (WHI)')
    expect(out).toContain('00:23 Highlight')
    expect(out).toContain('00:38 Goal 2-0 (WHI)')
  })
})

describe('chapters — match markers', () => {
    const events: MatchEvent[] = [
        { id: 'k', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' },
        { id: 'g', matchTimeSec: 200, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
        { id: 'w', matchTimeSec: 900, sourceFileIndex: 0, type: 'final_whistle' },
    ]

    it('should leave Kick off and Final whistle out of YouTube chapters', () => {
        const text = generateYouTubeChapters(events, [0], 60, 10, 4, TEAMS)
        expect(text).not.toMatch(/Kick off|Final whistle/)
        expect(text).toContain('02:10 Goal 1-0 (WHI)')
    })

    it('should leave them out of highlight chapters', () => {
        const text = generateHighlightChapters(events, [0], 10, 4, TEAMS)
        expect(text.split('\n').filter((l) => /^\d\d:\d\d/.test(l))).toEqual(['00:00 Goal 1-0 (WHI)'])
    })
})

describe('matchChapterLines — Half time', () => {
    it('should add a Half time line at the marker, with no lead-in, and keep the other markers out', () => {
        const events: MatchEvent[] = [
            { id: 'k', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' },
            { id: 'g', matchTimeSec: 200, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
            { id: 'h', matchTimeSec: 1560, sourceFileIndex: 0, type: 'half_time' },
            { id: 'w', matchTimeSec: 3000, sourceFileIndex: 0, type: 'final_whistle' },
        ]
        expect(matchChapterLines(events, [0], 60, 3000, 10, TEAMS)).toEqual(['00:00 Kick off', '02:10 Goal 1-0 (WHI)', '25:00 Half time'])
    })
})

describe('chapters — no assists', () => {
  it('should leave the assist out of every chapter', () => {
    const g = { ...goal('a', 60, 'Red', 'Sam'), assist: 'Jo' }
    expect(generateYouTubeChapters([g], [0], 0, 10, 4)).toContain('00:50 Goal 1 (Red) Sam')
    expect(generateYouTubeChapters([g], [0], 0, 10, 4)).not.toContain('assist')
    expect(generateHighlightChapters([g], [0], 10, 4)).not.toContain('assist')
  })
})

describe('chapters — team abbreviations', () => {
  it('should use initials in the header and labels, and the name when the team is unknown', () => {
    const events = [goal('a', 60, 'Whites', 'Sam'), goal('b', 120, 'Mystery')]
    const out = generateHighlightChapters(events, [0], 10, 4, TEAMS)
    expect(out.split('\n')[0]).toBe('WHI 1-0 CO')
    expect(out).toContain('00:00 Goal 1-0 (WHI) Sam')
    expect(out).toContain('00:15 Goal 1-0 (Mystery)')
  })
})

describe('chapters — notes on every event type', () => {
  it('should keep the note on own goals, saves, fouls and highlights', () => {
    const e = (id: string, t: number, type: MatchEvent['type'], team: string): MatchEvent =>
      ({ id, matchTimeSec: t, sourceFileIndex: 0, type, team, scorer: 'Sam', notes: `n-${type}` })
    const events = [e('a', 60, 'own_goal', 'Whites'), e('b', 120, 'save', 'Colours'), e('c', 180, 'foul', 'Colours'), e('d', 240, 'highlight', 'Whites')]
    const out = generateYouTubeChapters(events, [0], 0, 10, 4, TEAMS)
    expect(out).toContain('00:50 Own goal 1-0 (WHI) Sam: n-own_goal')
    expect(out).toContain('01:50 Save (CO) Sam: n-save')
    expect(out).toContain('02:50 Foul (CO) Sam: n-foul')
    expect(out).toContain('03:50 Highlight (WHI) Sam: n-highlight')
  })
})
