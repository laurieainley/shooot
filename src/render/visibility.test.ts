import { describe, it, expect } from 'vitest'
import { trackVisibility, type VisibilityDoc } from './visibility'

function fakeDoc(): VisibilityDoc & { set: (v: 'visible' | 'hidden') => void } {
    const t = new EventTarget()
    const doc = Object.assign(t, { visibilityState: 'visible' as 'visible' | 'hidden', set(v: 'visible' | 'hidden') { doc.visibilityState = v; t.dispatchEvent(new Event('visibilitychange')) } })
    return doc
}

describe('trackVisibility', () => {
    it('should count hidden periods and total hidden time', () => {
        let now = 0
        const doc = fakeDoc()
        const tr = trackVisibility(doc, () => now)
        now = 1000; doc.set('hidden')
        now = 4000; doc.set('visible')
        now = 5000; doc.set('hidden')
        now = 5500; doc.set('visible')
        expect(tr.stop()).toEqual({ hiddenCount: 2, hiddenMs: 3500 })
    })
    it('should count a tab that is hidden at the start and still hidden at the end', () => {
        let now = 0
        const doc = fakeDoc()
        doc.set('hidden')
        const tr = trackVisibility(doc, () => now)
        now = 2000
        expect(tr.stop()).toEqual({ hiddenCount: 1, hiddenMs: 2000 })
    })
    it('should stop listening after stop', () => {
        let now = 0
        const doc = fakeDoc()
        const tr = trackVisibility(doc, () => now)
        tr.stop()
        now = 10; doc.set('hidden')
        expect(tr.stop()).toEqual({ hiddenCount: 0, hiddenMs: 0 })
    })
    it('should report zeros without a document', () => {
        expect(trackVisibility(undefined, () => 0).stop()).toEqual({ hiddenCount: 0, hiddenMs: 0 })
    })
})
