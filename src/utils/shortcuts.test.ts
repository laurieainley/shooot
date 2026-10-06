// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { shortcutFor, shouldHandleShortcut } from './shortcuts'

const key = (k: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) => shortcutFor({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra })

describe('shortcutFor', () => {
    it('should map every player shortcut', () => {
        expect([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'g', 'm', 'f', 'z', '0', ',', '.', '/', '[', ']'].map((k) => key(k))).toEqual([
            'playPause', 'seekBack', 'seekForward', 'frameForward', 'frameBack', 'jumpStart', 'jumpEnd', 'mark', 'mute', 'fullscreen', 'zoomCycle', 'zoomReset', 'speedDown', 'speedUp', 'speedReset', 'prevFile', 'nextFile',
        ])
    })
    it('should make Shift+arrows the fine seek and be case-insensitive for letters', () => {
        expect(key('ArrowLeft', { shiftKey: true })).toBe('seekBackFine')
        expect(key('ArrowRight', { shiftKey: true })).toBe('seekForwardFine')
        expect(key('G')).toBe('mark')
    })
    it('should leave browser combos and other keys alone', () => {
        expect(key('g', { metaKey: true })).toBeNull()
        expect(key('z', { ctrlKey: true })).toBeNull()
        expect(key('f', { altKey: true })).toBeNull()
        expect(key('q')).toBeNull()
        expect(key('Enter')).toBeNull()
    })
})

describe('shouldHandleShortcut', () => {
    const open = { modalOpen: false }
    const make = (html: string): HTMLElement => {
        document.body.innerHTML = html
        return document.body.firstElementChild as HTMLElement
    }
    it('should run with focus on the body, the video, a log row, a button and the strip', () => {
        expect(shouldHandleShortcut(document.body, open)).toBe(true)
        expect(shouldHandleShortcut(make('<video></video>'), open)).toBe(true)
        expect(shouldHandleShortcut(make('<section aria-label="Events" tabindex="0"><ol role="listbox"><li role="option" id="r">x</li></ol></section>').querySelector('#r'), open)).toBe(true)
        expect(shouldHandleShortcut(make('<button>Play</button>'), open)).toBe(true)
        expect(shouldHandleShortcut(make('<div class="match-strip" role="slider" tabindex="0"></div>'), open)).toBe(true)
        expect(shouldHandleShortcut(make('<input type="checkbox">'), open)).toBe(true)
        expect(shouldHandleShortcut(null, open)).toBe(true)
    })
    it('should not run in text fields, textareas, selects or contenteditable', () => {
        expect(shouldHandleShortcut(make('<input type="text">'), open)).toBe(false)
        expect(shouldHandleShortcut(make('<input>'), open)).toBe(false)
        expect(shouldHandleShortcut(make('<input type="number">'), open)).toBe(false)
        expect(shouldHandleShortcut(make('<input type="range">'), open)).toBe(false)
        expect(shouldHandleShortcut(make('<textarea></textarea>'), open)).toBe(false)
        expect(shouldHandleShortcut(make('<select><option>a</option></select>'), open)).toBe(false)
        const ce = make('<div contenteditable="true"><span id="s">x</span></div>')
        expect(shouldHandleShortcut(ce.querySelector('#s'), open)).toBe(false)
    })
    it('should not run in menus and tabs', () => {
        expect(shouldHandleShortcut(make('<div role="menu"><button id="b">x</button></div>').querySelector('#b'), open)).toBe(false)
        expect(shouldHandleShortcut(make('<div role="tab"></div>'), open)).toBe(false)
    })
    it('should not run while a sheet or the picker is open, wherever focus is', () => {
        expect(shouldHandleShortcut(document.body, { modalOpen: true })).toBe(false)
        expect(shouldHandleShortcut(make('<button>x</button>'), { modalOpen: true })).toBe(false)
    })
    it('should not run inside a dialog even when the store does not know about it', () => {
        expect(shouldHandleShortcut(make('<div role="dialog"><button id="b">x</button></div>').querySelector('#b'), open)).toBe(false)
    })
})
