// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TopBar } from './TopBar'

describe('TopBar', () => {
    it.each(['desktop', 'tablet', 'landscape', 'phone'] as const)('should show the Beta tag beside the logo on %s', (layout) => {
        render(<TopBar layout={layout} />)
        const tag = screen.getByTitle('Shooot is in beta: things may change')
        expect(tag).toHaveTextContent('Beta')
        expect(tag.parentElement?.className).toBe('brand')
    })
})
