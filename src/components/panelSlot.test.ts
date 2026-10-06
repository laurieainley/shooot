import { describe, it, expect } from 'vitest'
import { panelPlacement } from './panelSlot'

describe('panelPlacement', () => {
    it('should keep the popover for a mouse, in or out of fullscreen', () => {
        expect(panelPlacement(false, false)).toBe('popover')
        expect(panelPlacement(false, true)).toBe('popover')
    })

    it('should replace the events column on touch and shrink to a compact overlay in fullscreen', () => {
        expect(panelPlacement(true, false)).toBe('column')
        expect(panelPlacement(true, true)).toBe('compact')
    })
})
