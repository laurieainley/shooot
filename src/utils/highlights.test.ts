import { describe, it, expect } from 'vitest'
import { mergeOverlappingGoalSegments } from './highlights'
import type { MatchEvent } from '../types'

function goal(id: string, matchTimeSec: number, sourceFileIndex = 0): MatchEvent {
  return { id, matchTimeSec, sourceFileIndex, type: 'goal' as const }
}

const NO_OFFSETS = [0]
const BEFORE = 5
const AFTER = 10

describe('mergeOverlappingGoalSegments', () => {
  it('should return empty array for no goals', () => {
    expect(mergeOverlappingGoalSegments([], NO_OFFSETS, 0, false, BEFORE, AFTER)).toEqual([])
  })

  it('should produce one segment for a single goal', () => {
    const result = mergeOverlappingGoalSegments([goal('a', 60)], NO_OFFSETS, 0, false, BEFORE, AFTER)
    expect(result).toHaveLength(1)
    expect(result[0].startTime).toBe(55)
    expect(result[0].endTime).toBe(70)
    expect(result[0].duration).toBe(15)
    expect(result[0].goals).toHaveLength(1)
  })

  it('should merge two overlapping goals into one segment', () => {
    // goal at 60s, goal at 62s — windows overlap (55–70 and 57–72)
    const result = mergeOverlappingGoalSegments(
      [goal('a', 60), goal('b', 62)],
      NO_OFFSETS,
      0,
      false,
      BEFORE,
      AFTER,
    )
    expect(result).toHaveLength(1)
    expect(result[0].startTime).toBe(55)
    expect(result[0].endTime).toBe(72)
    expect(result[0].goals).toHaveLength(2)
  })

  it('should keep non-overlapping goals as separate segments', () => {
    // goal at 30s (25–40) and goal at 100s (95–110) — no overlap
    const result = mergeOverlappingGoalSegments(
      [goal('a', 30), goal('b', 100)],
      NO_OFFSETS,
      0,
      false,
      BEFORE,
      AFTER,
    )
    expect(result).toHaveLength(2)
    expect(result[0].startTime).toBe(25)
    expect(result[1].startTime).toBe(95)
  })

  it('should not merge goals from different source files', () => {
    // Both at 60s but from different files
    const result = mergeOverlappingGoalSegments(
      [goal('a', 60, 0), goal('b', 60, 1)],
      [0, 70],
      0,
      false,
      BEFORE,
      AFTER,
    )
    expect(result).toHaveLength(2)
    expect(result[0].sourceFileIndex).toBe(0)
    expect(result[1].sourceFileIndex).toBe(1)
  })

  it('should sort goals by absolute timeline position before merging', () => {
    // Pass goals out of order — should still produce sorted, correct segments
    const result = mergeOverlappingGoalSegments(
      [goal('b', 100), goal('a', 30)],
      NO_OFFSETS,
      0,
      false,
      BEFORE,
      AFTER,
    )
    expect(result).toHaveLength(2)
    expect(result[0].startTime).toBe(25) // goal 'a' at 30s comes first
    expect(result[1].startTime).toBe(95) // goal 'b' at 100s
  })

  it('should compute correct duration for each merged segment', () => {
    const result = mergeOverlappingGoalSegments([goal('a', 60)], NO_OFFSETS, 0, false, BEFORE, AFTER)
    expect(result[0].duration).toBe(result[0].endTime - result[0].startTime)
  })
})

describe('mergeOverlappingGoalSegments — match markers', () => {
  it('should never make clips for Kick off or Final whistle', () => {
    const events: MatchEvent[] = [
      { id: 'k', matchTimeSec: 5, sourceFileIndex: 0, type: 'kick_off' },
      goal('g', 100),
      { id: 'w', matchTimeSec: 900, sourceFileIndex: 0, type: 'final_whistle' },
    ]
    const segs = mergeOverlappingGoalSegments(events, NO_OFFSETS, 0, false, BEFORE, AFTER)
    expect(segs.map((s) => s.goals.map((g) => g.id))).toEqual([['g']])
    expect(mergeOverlappingGoalSegments(events.filter((e) => e.type !== 'goal'), NO_OFFSETS, 0, false, BEFORE, AFTER)).toEqual([])
  })
})
