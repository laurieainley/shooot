// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NOTE_MAX } from '../utils/eventTypes'
import { NoteCounter } from './NoteCounter'

afterEach(cleanup)

describe('NoteCounter', () => {
    it('should stay hidden until 20 characters from the limit', () => {
        render(<NoteCounter value={'x'.repeat(NOTE_MAX - 21)} />)
        expect(screen.queryByText(/\//)).not.toBeInTheDocument()
    })

    it('should show "N / NOTE_MAX" from 20 characters before the limit', () => {
        render(<NoteCounter value={'x'.repeat(NOTE_MAX - 20)} />)
        expect(screen.getByText(`${NOTE_MAX - 20} / ${NOTE_MAX}`)).toBeInTheDocument()
    })

    it('should be a polite live region that exists while empty so a screen reader hears it appear', () => {
        const { container } = render(<NoteCounter value="" />)
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
    })
})
