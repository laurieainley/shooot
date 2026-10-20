import { describe, expect, it } from 'vitest'
import { wheelPace } from './wheelPace'
import { wheelZoomFactor } from '../utils/zoom'

describe('wheelPace', () => {
    it('should give the first event a full step and cap events that follow within a frame or two', () => {
        const step = wheelPace()
        expect(step({ deltaY: -100, deltaMode: 0, timeStamp: 1000 })).toBe(wheelZoomFactor(-100))
        expect(step({ deltaY: -100, deltaMode: 0, timeStamp: 1016 })).toBe(wheelZoomFactor(-100, 0, 16))
        expect(step({ deltaY: -100, deltaMode: 0, timeStamp: 1500 })).toBe(wheelZoomFactor(-100))
    })
})
