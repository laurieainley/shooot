import { describe, it, expect } from 'vitest'
import { generateYouTubeChapters, generateHighlightChapters } from './chapters'
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
