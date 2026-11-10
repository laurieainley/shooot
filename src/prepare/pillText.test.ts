import { describe, expect, it } from 'vitest'
import { KEEP_AWAKE, pillText } from './pillText'

describe('pillText', () => {
    const preparing = { kind: 'preparing', what: 'full match', percent: 34 } as const
    const ready = { kind: 'ready', what: 'full match and highlights', text: 'Full match 4K and highlights 4K are ready; the export will only redo what you change.' } as const
    it('should keep the desktop text as it was', () => {
        expect(pillText(preparing)?.label).toBe('Preparing full match · 34%')
        expect(pillText(preparing)?.tip).not.toContain(KEEP_AWAKE)
        expect(pillText(ready)?.label).toBe('Ready ✓')
        expect(pillText(ready, { touch: false })?.label).toBe('Ready ✓')
    })
    it('should tell a touch device to keep the screen on while preparing', () => {
        expect(pillText(preparing, { touch: true })?.label).toBe('Preparing full match · 34%')
        expect(pillText(preparing, { touch: true })?.tip).toContain('Keep the screen on — it stops if the phone locks.')
    })
    it('should say what is prepared on a touch device when ready', () => {
        expect(pillText(ready, { touch: true })?.label).toBe('Full match and highlights prepared ✓')
        expect(pillText({ kind: 'ready', text: 'x' }, { touch: true })?.label).toBe('Ready ✓')
    })
})
