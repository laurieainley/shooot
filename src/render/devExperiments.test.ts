import { afterEach, describe, expect, it } from 'vitest'
import { devExperiments } from './devExperiments'

describe('devExperiments', () => {
    afterEach(() => { delete (globalThis as { __shoootExperiments?: unknown }).__shoootExperiments })
    it('should be off unless the dev harness sets it', () => {
        expect(devExperiments()).toBeUndefined()
        ;(globalThis as { __shoootExperiments?: unknown }).__shoootExperiments = { segmentSec: 4 }
        expect(devExperiments()).toEqual({ segmentSec: 4 })
    })
})
