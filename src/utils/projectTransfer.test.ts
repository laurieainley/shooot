import { describe, it, expect } from 'vitest'
import { buildTransferPayload, decodeProject, encodeProject, fragmentData, qrIsDense, transferUrl, type TransferPayload } from './projectTransfer'
import type { MatchEvent } from '../types'

const events: MatchEvent[] = [
    { id: 'a', matchTimeSec: 120, sourceFileIndex: 0, sourceFileKey: '01-0226', type: 'goal', team: 'Whites', scorer: 'Zoë Ñandú ⚽' },
    { id: 'b', matchTimeSec: 300, sourceFileIndex: 0, sourceFileKey: '01-0226', type: 'highlight' },
]
const payload = (over: Partial<TransferPayload> = {}): TransferPayload => ({
    events,
    teams: [{ name: 'Whites', color: '#fff', roster: ['Zoë Ñandú ⚽'] }, { name: 'Colours', color: '#c00', roster: [] }],
    lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
    graphics: { cards: true, lowerThirds: true, replayTag: false },
    fullMatch: { cards: true, scoreBug: 'periodic', intervalMin: 5 },
    matchdayLabel: 'Matchday 3', goalAreas: null, adjustTimestampsByOffset: false,
    ...over,
})

describe('assist in transfers', () => {
    it('should round trip an assist through a transfer link', async () => {
        const withAssist = [{ ...events[0], assist: 'Zoë Ñandú' }, events[1]]
        const decoded = await decodeProject(await encodeProject(buildTransferPayload(payload({ events: withAssist }))))
        expect(decoded.events[0].assist).toBe('Zoë Ñandú')
    })
})

describe('encodeProject / decodeProject', () => {
    it('should round trip including unicode names', async () => {
        const p = payload()
        expect(await decodeProject(await encodeProject(p))).toEqual(p)
    })

    it('should use a version prefix and URL-safe characters', async () => {
        const s = await encodeProject(payload())
        expect(s).toMatch(/^[a-z]1\.[A-Za-z0-9_-]+$/)
    })

    it('should compress large rosters well below the raw size', async () => {
        const roster = Array.from({ length: 300 }, (_, i) => `Player Number ${i} Surname`)
        const p = payload({ teams: [{ name: 'A', color: '#fff', roster }, { name: 'B', color: '#000', roster }] })
        const s = await encodeProject(p)
        expect(s.length).toBeLessThan(JSON.stringify(p).length / 2)
        expect(await decodeProject(s)).toEqual(p)
    })

    it('should fall back to uncompressed when CompressionStream is unavailable', async () => {
        const orig = globalThis.CompressionStream
        // @ts-expect-error simulate an old browser
        delete globalThis.CompressionStream
        try {
            const s = await encodeProject(payload())
            expect(s.startsWith('r1.')).toBe(true)
            expect(await decodeProject(s)).toEqual(payload())
        } finally { globalThis.CompressionStream = orig }
    })

    it('should reject corrupt, unknown-version or empty input', async () => {
        await expect(decodeProject('')).rejects.toThrow()
        await expect(decodeProject('z1.%%%')).rejects.toThrow()
        await expect(decodeProject('z1.AAAA')).rejects.toThrow()
        await expect(decodeProject('x9.AAAA')).rejects.toThrow(/version|link/i)
        await expect(decodeProject('r1.' + btoa('{"nope":1}'))).rejects.toThrow()
    })
})

describe('transferUrl / fragmentData', () => {
    it('should build a link with the data in the fragment and read it back', () => {
        const url = transferUrl('https://shot-stopper.vercel.app', 'z1.abc')
        expect(url).toBe('https://shot-stopper.vercel.app/#p=z1.abc')
        expect(fragmentData('#p=z1.abc')).toBe('z1.abc')
    })
    it('should return null for other fragments', () => {
        expect(fragmentData('')).toBeNull()
        expect(fragmentData('#other')).toBeNull()
        expect(fragmentData('#p=')).toBeNull()
    })
})

describe('qrIsDense', () => {
    it('should flag links over about 2,500 characters', () => {
        expect(qrIsDense('x'.repeat(2500))).toBe(false)
        expect(qrIsDense('x'.repeat(2501))).toBe(true)
    })
})

describe('buildTransferPayload', () => {
    it('should pick only project fields, never files', () => {
        const p = buildTransferPayload({ ...payload(), files: [{ name: 'x' }], panel: 'menu', undoStack: [] } as never)
        expect(Object.keys(p).sort()).toEqual(Object.keys(payload()).sort())
    })
})
