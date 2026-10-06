import { describe, it, expect } from 'vitest'
import { clockWidthCh, computeCumulativeOffsets, formatClock, formatEventClock, isLongTimeline, formatHMS, parseTimeToSeconds } from './timeline'
import type { VideoSourceFile } from '../types'

function makeFile(durationSec?: number): VideoSourceFile {
  return { id: '1', file: {} as File, url: '', name: 'test.mp4', durationSec, kind: 'full' }
}

describe('computeCumulativeOffsets', () => {
  it('should return empty array for no files', () => {
    expect(computeCumulativeOffsets([])).toEqual([])
  })

  it('should return [0] for a single file', () => {
    expect(computeCumulativeOffsets([makeFile(90)])).toEqual([0])
  })

  it('should accumulate offsets across files', () => {
    const files = [makeFile(60), makeFile(90), makeFile(30)]
    expect(computeCumulativeOffsets(files)).toEqual([0, 60, 150])
  })

  it('should treat missing durationSec as 0', () => {
    const files = [makeFile(undefined), makeFile(60)]
    expect(computeCumulativeOffsets(files)).toEqual([0, 0])
  })
})

describe('formatHMS', () => {
  it('should format seconds under 1 minute as MM:SS', () => {
    expect(formatHMS(0)).toBe('00:00')
    expect(formatHMS(9)).toBe('00:09')
    expect(formatHMS(59)).toBe('00:59')
  })

  it('should format seconds between 1 and 59 minutes as MM:SS', () => {
    expect(formatHMS(60)).toBe('01:00')
    expect(formatHMS(90)).toBe('01:30')
    expect(formatHMS(3599)).toBe('59:59')
  })

  it('should format 1 hour or more as HH:MM:SS', () => {
    expect(formatHMS(3600)).toBe('01:00:00')
    expect(formatHMS(3661)).toBe('01:01:01')
    expect(formatHMS(7384)).toBe('02:03:04')
  })

  it('should clamp negative values to 0', () => {
    expect(formatHMS(-5)).toBe('00:00')
  })

  it('should floor fractional seconds', () => {
    expect(formatHMS(90.9)).toBe('01:30')
  })
})

describe('parseTimeToSeconds', () => {
    it('should parse seconds, mm:ss and hh:mm:ss', () => {
        expect(parseTimeToSeconds('90')).toBe(90)
        expect(parseTimeToSeconds('1:30')).toBe(90)
        expect(parseTimeToSeconds('01:02:03')).toBe(3723)
    })
    it('should reject invalid input', () => {
        expect(parseTimeToSeconds('')).toBeNull()
        expect(parseTimeToSeconds('1:75')).toBeNull()
        expect(parseTimeToSeconds('abc')).toBeNull()
    })
})

describe('formatEventClock', () => {
    it('should show file time when no match start is set', () => {
        expect(formatEventClock(1421, 75, 0)).toBe('01:15')
    })

    it('should show match clock relative to kick-off when a start is set', () => {
        expect(formatEventClock(1521, 1521, 100)).toBe('23:41')
    })

    it('should prefix events before kick-off with a minus sign', () => {
        expect(formatEventClock(70, 70, 100)).toBe('−00:30')
    })

    it('should use the long shape in a long project', () => {
        expect(formatEventClock(1521, 1521, 100, true)).toBe('0:23:41')
        expect(formatEventClock(75, 75, 0, true)).toBe('0:01:15')
    })
})

describe('formatClock', () => {
    it('should always show mm:ss with leading zeros for a short project', () => {
        expect(formatClock(0, false)).toBe('00:00')
        expect(formatClock(5, false)).toBe('00:05')
        expect(formatClock(1440, false)).toBe('24:00')
        expect(formatClock(3599.9, false)).toBe('59:59')
    })
    it('should show h:mm:ss for a long project, from the first second', () => {
        expect(formatClock(5, true)).toBe('0:00:05')
        expect(formatClock(1440, true)).toBe('0:24:00')
        expect(formatClock(3725, true)).toBe('1:02:05')
    })
    it('should not truncate a short project past an hour', () => {
        expect(formatClock(3725, false)).toBe('1:02:05')
    })
    it('should clamp negatives and fractions', () => {
        expect(formatClock(-3, false)).toBe('00:00')
        expect(formatClock(59.99, false)).toBe('00:59')
    })
    it('should have the same length at 24:00 and 00:05 (no width change while scrubbing)', () => {
        for (const long of [false, true]) expect(formatClock(1440, long)).toHaveLength(formatClock(5, long).length)
    })
})

describe('isLongTimeline and clockWidthCh', () => {
    it('should call a project of an hour or more long', () => {
        expect(isLongTimeline(3599)).toBe(false)
        expect(isLongTimeline(3600)).toBe(true)
    })
    it('should reserve the clock plus a sign slot', () => {
        expect(clockWidthCh(false, false)).toBe(5)
        expect(clockWidthCh(false, true)).toBe(6)
        expect(clockWidthCh(true, true)).toBe(8)
    })
})
