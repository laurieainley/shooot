import { describe, it, expect } from 'vitest'
import { emptyLogLine, POLISHING, polishingChip, REEL_READY, listeningLine, keptSummary, downloadingModelLine } from './voice'

describe('voice', () => {
    it('should greet an empty log with the brand line, then say what to do', () => {
        expect(emptyLogLine(false, true)).toEqual({ lead: 'No goals yet. Classic.', hint: 'Load a video, then press', key: 'G', tail: 'while it plays.' })
        expect(emptyLogLine(false, false).hint).toBe('Press')
        expect(emptyLogLine(true, true)).toEqual({ lead: 'No goals yet. Classic.', hint: 'Load a video, then tap ＋ while it plays.' })
        expect(emptyLogLine(true, false).hint).toBe('Tap ＋ while the video plays.')
    })

    it('should report render progress as polishing the tap-ins, the chip rounded to a whole percent', () => {
        expect(POLISHING).toBe('Polishing the tap-ins…')
        expect(polishingChip(0.644)).toBe('Polishing… 64%')
        expect(polishingChip(0)).toBe('Polishing… 0%')
        expect(polishingChip(1.4)).toBe('Polishing… 100%')
    })

    it('should word the done state', () => {
        expect(REEL_READY).toBe("Reel ready. Group chat won't know what's hit it.")
    })
})

describe('find goals lines', () => {
    it('should show progress in the brand voice', () => { expect(listeningLine(0.4)).toBe('Listening for the roar… 40%') })
    it('should show the ball model download in plain words', () => { expect(downloadingModelLine(0.426)).toBe('Downloading the ball model… 43%') })
    it('should summarise kept suggestions', () => { expect(keptSummary(6, 22)).toBe('You kept 6 of 22.') })
    it('should add how many were top picks when there were any', () => {
        expect(keptSummary(4, 6, 3)).toBe('You kept 4 of 6 · 3 were top picks.')
        expect(keptSummary(4, 6, 1)).toBe('You kept 4 of 6 · 1 was a top pick.')
        expect(keptSummary(4, 6, 0)).toBe('You kept 4 of 6.')
    })
})
