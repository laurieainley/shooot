import { describe, it, expect, vi } from 'vitest'
import { useAppState } from '../state'
import { buildTransferPayload } from '../utils/projectTransfer'
import { cancelDetection } from '../detectJobs'
import { applyTransferPayload } from './applyProject'

vi.mock('../detectJobs', async (orig) => ({ ...(await orig<typeof import('../detectJobs')>()), cancelDetection: vi.fn() }))
import type { MatchEvent } from '../types'

describe('applyTransferPayload', () => {
    it('should cancel detection and clear suggestions', () => {
        useAppState.setState({ suggestions: [{ id: 's', globalTimeSec: 5, score: 1, source: 'audio', status: 'pending' }] })
        applyTransferPayload(buildTransferPayload({ ...useAppState.getState(), events: [] }))
        expect(cancelDetection).toHaveBeenCalled()
        expect(useAppState.getState().suggestions).toEqual([])
    })

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

    it('should clear suggestions when a project is applied', () => {
        useAppState.getState().setSuggestions({ createdAt: 1, source: 'audio', configVersion: 1, analysedSec: 60, total: 1 }, [{ timeSec: 10, score: 1 }])
        const base = buildTransferPayload({ ...useAppState.getState(), events: [], teams: [] })
        applyTransferPayload(base)
        expect(useAppState.getState().suggestions).toEqual([])
        expect(useAppState.getState().suggestionRun).toBeNull()
    })

    it('should apply goal marks, and treat malformed or missing marks as none without throwing', () => {
        const marks = { team1: { postL: { x: 0.1, y: 0.5 }, postR: { x: 0.2, y: 0.5 }, barL: { x: 0.1, y: 0.4 }, barR: { x: 0.2, y: 0.4 } } }
        const base = buildTransferPayload({ ...useAppState.getState(), events: [], teams: [] })
        applyTransferPayload({ ...base, goalMarks: marks })
        expect(useAppState.getState().goalMarks).toEqual(marks)
        expect(() => applyTransferPayload({ ...base, goalMarks: { team1: 'x' } as never })).not.toThrow()
        expect(useAppState.getState().goalMarks).toBeNull()
        applyTransferPayload({ ...base, goalMarks: undefined as never })
        expect(useAppState.getState().goalMarks).toBeNull()
    })
})

describe('known final score on load', () => {
    it('should load it from a received project and clear it when the project has none', () => {
        const base = buildTransferPayload({ ...useAppState.getState(), events: [] })
        applyTransferPayload({ ...base, knownFinalScore: [13, 9] })
        expect(useAppState.getState().knownFinalScore).toEqual([13, 9])
        const older: Record<string, unknown> = { ...base }
        delete older.knownFinalScore
        applyTransferPayload(older as never)
        expect(useAppState.getState().knownFinalScore).toBeNull()
        applyTransferPayload({ ...base, knownFinalScore: 'x' as never })
        expect(useAppState.getState().knownFinalScore).toBeNull()
    })
    it('should load it from a project file and treat older files as none', async () => {
        const { applyProjectData } = await import('./importProject')
        applyProjectData({ events: [], teams: useAppState.getState().teams, knownFinalScore: [2, 1] })
        expect(useAppState.getState().knownFinalScore).toEqual([2, 1])
        applyProjectData({ events: [], teams: useAppState.getState().teams })
        expect(useAppState.getState().knownFinalScore).toBeNull()
    })
})
