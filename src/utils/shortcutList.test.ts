import { describe, it, expect } from 'vitest'
import { SHORTCUT_GROUPS } from './shortcutList'
import { shortcutFor } from './shortcuts'

const key = (k: string) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })

describe('SHORTCUT_GROUPS', () => {
    it('should list the five groups', () => {
        expect(SHORTCUT_GROUPS.map((g) => g.title)).toEqual(['Playback', 'Tagging', 'Navigation', 'Zoom', 'Editing'])
    })
    it('should only document keys the handler really maps to that action', () => {
        for (const row of SHORTCUT_GROUPS.flatMap((g) => g.rows)) {
            if (row.action && row.key) expect(shortcutFor(key(row.key)), row.what).toBe(row.action)
        }
    })
    it('should document every player action', () => {
        const documented = new Set(SHORTCUT_GROUPS.flatMap((g) => g.rows).map((r) => r.action))
        for (const k of [' ', 'g', 'm', 'f', 'z', '0', ',', '.', '/', '[', 'Home', 'End', 'ArrowLeft', 'ArrowUp', '?']) {
            expect(documented.has(shortcutFor(key(k))!), k).toBe(true)
        }
    })
    it('should give every row keys and a description', () => {
        for (const row of SHORTCUT_GROUPS.flatMap((g) => g.rows)) {
            expect(row.keys.length).toBeGreaterThan(0)
            expect(row.what.length).toBeGreaterThan(0)
        }
    })
})
