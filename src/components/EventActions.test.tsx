// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventActions } from './EventActions'
import type { MatchEvent } from '../types'

const goal: MatchEvent = { id: 'a', matchTimeSec: 100, sourceFileIndex: 0, type: 'goal' }
const props = { touch: false, onToggleReplay: vi.fn(), onFraming: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() }

describe('EventActions Star slot', () => {
    it('should put the Star slot between Framing and the download slot', () => {
        render(<EventActions {...props} event={goal} star={<button type="button">Star slot</button>} download={<button type="button">Download slot</button>} />)
        const names = screen.getAllByRole('button').map((b) => b.textContent)
        const at = (s: string): number => names.findIndex((n) => n?.includes(s))
        expect(at('Framing')).toBeLessThan(at('Star slot'))
        expect(at('Star slot')).toBeLessThan(at('Download slot'))
    })
    it('should not render the Star slot for a marker', () => {
        render(<EventActions {...props} event={{ ...goal, type: 'kick_off' }} star={<button type="button">Star slot</button>} />)
        expect(screen.queryByText('Star slot')).toBeNull()
    })
})
