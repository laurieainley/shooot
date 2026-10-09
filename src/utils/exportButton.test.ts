import { describe, it, expect } from 'vitest'
import { exportButtonStatus } from './exportButton'

describe('exportButtonStatus', () => {
    it('should be idle without a job', () => {
        expect(exportButtonStatus(null, 0)).toEqual({ kind: 'idle' })
    })
    it('should show the rounded percentage while running', () => {
        expect(exportButtonStatus({ phase: 'running', fraction: 0.424, finishedAt: null }, 0)).toEqual({ kind: 'running', percent: 42 })
        expect(exportButtonStatus({ phase: 'running', fraction: 1.2, finishedAt: null }, 0)).toEqual({ kind: 'running', percent: 100 })
    })
    it('should say done, then go idle after four seconds', () => {
        const job = { phase: 'done' as const, fraction: 1, finishedAt: 1000 }
        expect(exportButtonStatus(job, 2000)).toEqual({ kind: 'done' })
        expect(exportButtonStatus(job, 6000)).toEqual({ kind: 'idle' })
    })
    it('should say failed briefly', () => {
        expect(exportButtonStatus({ phase: 'failed' as never, fraction: 0.3, finishedAt: 1000 }, 1500)).toEqual({ kind: 'failed' })
    })
})
