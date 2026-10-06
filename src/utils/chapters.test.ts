import { describe, it, expect } from 'vitest'
import { generateYouTubeChapters, generateHighlightChapters, matchChapterLines } from './chapters'
import type { MatchEvent } from '../types'

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
        const out = generateYouTubeChapters(events, [0], 0, 10, 4, ['Whites', 'Colours'])
        expect(out.split('\n')[0]).toBe('Whites 1-1 Colours')
        expect(out).toContain('00:50 Goal (pen) 1-0 (Whites) Sam')
        expect(out).toContain('01:50 Highlight')
        expect(out).toContain('02:50 Own goal 1-1 (Colours) Alex')
        expect(out).toContain('03:50 Penalty missed (Whites) Jo')
    })
})

describe('chapters — notes', () => {
    const e = (id: string, t: number, extra: Partial<MatchEvent>): MatchEvent => ({ id, matchTimeSec: t, sourceFileIndex: 0, type: 'highlight', ...extra })

    it('should add a shortened note after the person', () => {
        const events = [
            e('a', 734, { team: 'Whites', scorer: 'Sam', notes: 'nutmeg on the wing' }),
            e('b', 800, { type: 'foul', team: 'Colours', notes: 'late tackle' }),
            e('c', 900, { notes: 'a very long description of a mazy run beating four defenders before shooting wide' }),
        ]
        const out = generateYouTubeChapters(events, [0], 0, 0, 4, ['Whites', 'Colours'])
        expect(out).toContain('12:14 Highlight (Whites) Sam: nutmeg on the wing')
        expect(out).toContain('13:20 Foul (Colours): late tackle')
        expect(out).toContain('15:00 Highlight: a very long description of a mazy run…')
        expect(generateHighlightChapters(events, [0], 10, 4, ['Whites', 'Colours'])).toContain('00:00 Highlight (Whites) Sam: nutmeg on the wing')
    })
})

describe('generateHighlightChapters — event types', () => {
    it('should not advance the score for non-scoring events', () => {
        const events: MatchEvent[] = [
            { id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'save', team: 'Colours', scorer: 'Jo' },
            { id: 'b', matchTimeSec: 120, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
        ]
        const out = generateHighlightChapters(events, [0], 10, 4, ['Whites', 'Colours'])
        expect(out).toContain('00:00 Save (Colours) Jo')
        expect(out).toContain('00:15 Goal 1-0 (Whites)')
    })
})

describe('generateHighlightChapters — replays', () => {
  it('should push later chapters back by each earlier replay', () => {
    const events: MatchEvent[] = [
      { id: 'a', matchTimeSec: 60, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
      { id: 'b', matchTimeSec: 120, sourceFileIndex: 0, type: 'highlight' },
      { id: 'c', matchTimeSec: 180, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
    ]
    const out = generateHighlightChapters(events, [0], 10, 4, ['Whites', 'Colours'], { beforeSec: 3, afterSec: 1, speed: 0.5 })
    // segment = 14 s + 1 s buffer; goal a adds a 8 s replay
    expect(out).toContain('00:00 Goal 1-0 (Whites)')
    expect(out).toContain('00:23 Highlight')
    expect(out).toContain('00:38 Goal 2-0 (Whites)')
  })
})

describe('chapters — match markers', () => {
    const events: MatchEvent[] = [
        { id: 'k', matchTimeSec: 60, sourceFileIndex: 0, type: 'kick_off' },
        { id: 'g', matchTimeSec: 200, sourceFileIndex: 0, type: 'goal', team: 'Whites' },
        { id: 'w', matchTimeSec: 900, sourceFileIndex: 0, type: 'final_whistle' },
    ]

    it('should leave Kick off and Final whistle out of YouTube chapters', () => {
        const text = generateYouTubeChapters(events, [0], 60, 10, 4, ['Whites', 'Colours'])
        expect(text).not.toMatch(/Kick off|Final whistle/)
        expect(text).toContain('02:10 Goal 1-0 (Whites)')
    })

    it('should leave them out of highlight chapters', () => {
        const text = generateHighlightChapters(events, [0], 10, 4, ['Whites', 'Colours'])
        expect(text.split('\n').filter((l) => /^\d\d:\d\d/.test(l))).toEqual(['00:00 Goal 1-0 (Whites)'])
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
        expect(matchChapterLines(events, [0], 60, 3000, 10, ['Whites', 'Colours'])).toEqual(['00:00 Kick off', '02:10 Goal 1-0 (Whites)', '25:00 Half time'])
    })
})

describe('chapter assists', () => {
  it('should add the assist after the scorer, only for normal goals', () => {
    const g = { ...goal('a', 60, 'Red', 'Sam'), assist: 'Jo' }
    expect(generateYouTubeChapters([g], [0], 0, 10, 4)).toContain('00:50 Goal 1 (Red) Sam, assist Jo')
    expect(generateHighlightChapters([g], [0], 10, 4)).toContain('00:00 Goal 1 (Red) Sam, assist Jo')
    expect(generateYouTubeChapters([{ ...g, pen: true }], [0], 0, 10, 4)).toContain('Goal (pen) 1 (Red) Sam')
    expect(generateYouTubeChapters([{ ...g, pen: true }], [0], 0, 10, 4)).not.toContain('assist')
  })
})
