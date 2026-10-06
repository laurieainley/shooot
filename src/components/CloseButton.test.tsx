// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CloseButton } from './CloseButton'

describe('CloseButton', () => {
    it('should be a button named Close that calls onClick', async () => {
        const onClick = vi.fn()
        render(<CloseButton onClick={onClick} />)
        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })
    it('should draw a 20 px icon in the shared close-btn hit area', () => {
        render(<CloseButton onClick={() => undefined} label="Close menu" />)
        const btn = screen.getByRole('button', { name: 'Close menu' })
        expect(btn).toHaveClass('close-btn')
        const svg = btn.querySelector('svg')!
        expect(svg.getAttribute('width')).toBe('20')
        expect(svg.getAttribute('height')).toBe('20')
    })
})
