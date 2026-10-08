import { describe, it, expect } from 'vitest'
import { useAppState } from '../state'
import { buildTransferPayload } from '../utils/projectTransfer'
import { applyTransferPayload } from './applyProject'
import type { MatchEvent } from '../types'

describe('applyTransferPayload', () => {
    it('should load an old penalty_awarded event as penalty_conceded with the team flipped', () => {
        const awarded = { id: 'p', type: 'penalty_awarded', matchTimeSec: 10, team: 'Reds', scorer: 'Sam' } as unknown as MatchEvent
        const payload = buildTransferPayload({
            ...useAppState.getState(), events: [awarded],
            teams: [{ name: 'Reds', color: '#c00', roster: ['Sam'] }, { name: 'Blues', color: '#00c', roster: ['Ben'] }],
        })
        applyTransferPayload(payload)
        const e = useAppState.getState().events[0]
        expect(e).toMatchObject({ type: 'penalty_conceded', team: 'Blues' })
        expect(e.scorer).toBeUndefined()
    })

    it('should carry the graphics theme of a received project, and fall back for one that has none', () => {
        const base = buildTransferPayload({ ...useAppState.getState(), events: [], teams: [] })
        applyTransferPayload({ ...base, graphics: { ...useAppState.getState().graphics, theme: 'classic' } })
        expect(useAppState.getState().graphics.theme).toBe('classic')
        applyTransferPayload({ ...base, graphics: { cards: true, lowerThirds: true, replayTag: true } as never })
        expect(useAppState.getState().graphics.theme).toBe('classic') // an old link says nothing about the look: keep the current one
        applyTransferPayload({ ...base, graphics: { ...useAppState.getState().graphics, theme: 'neon' as never } })
        expect(useAppState.getState().graphics.theme).toBe('classic')
        useAppState.getState().setGraphics({ theme: 'shooot' })
    })
})
