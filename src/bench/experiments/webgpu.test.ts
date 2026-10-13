import { describe, expect, it } from 'vitest'
import { breakdownSec, msPerFrame } from './webgpu'

describe('webgpu experiment helpers', () => {
    it('should turn pipeline stats into seconds', () => {
        expect(breakdownSec({ decodeWaitMs: 1500, paintMs: 29000, backpressureMs: 80000 })).toEqual({ decodeWait: 1.5, paintAndScale: 29, encodeCall: 0, backpressure: 80, packetWrites: 0 })
        expect(breakdownSec(null).paintAndScale).toBe(0)
    })
    it('should give ms per frame', () => {
        expect(msPerFrame(1200, 120)).toBe(10)
        expect(msPerFrame(5, 0)).toBe(5)
    })
})
