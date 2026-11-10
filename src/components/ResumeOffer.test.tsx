// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ResumeOffer } from './ResumeOffer'
import { partsSaveStore } from '../prepare/partsSave'
import type { JobState } from '../render/renderJob'

const job = { outputName: 'match.mp4', done: 4, total: 10 } as unknown as JobState

describe('ResumeOffer', () => {
    it('should not offer Resume while prepared parts are being saved (like Render)', () => {
        render(<ResumeOffer job={job} matches filesLoaded busy={false} onResume={() => undefined} onDiscard={() => undefined} />)
        expect(screen.getByRole('button', { name: 'Resume render' })).toBeEnabled()
        act(() => { partsSaveStore.setState({ phase: 'saving' }, true) })
        expect(screen.getByRole('button', { name: 'Resume render' })).toBeDisabled()
        act(() => { partsSaveStore.setState({ phase: 'idle' }, true) })
        expect(screen.getByRole('button', { name: 'Resume render' })).toBeEnabled()
    })
})
