import { describe, it, expect } from 'vitest'
import { computeCumulativeOffsets, formatHMS } from './timeline'
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
