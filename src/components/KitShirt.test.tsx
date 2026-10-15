// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { KitShirt } from './KitShirt'

describe('KitShirt', () => {
    it('should print the label on the shirt and hide it from assistive tech', () => {
        const { container } = render(<KitShirt color="#3a6ea5" label="WHI" size={56} />)
        const svg = container.querySelector('svg')!
        expect(svg.getAttribute('aria-hidden')).toBe('true')
        expect(svg.getAttribute('width')).toBe('56')
        expect(svg.textContent).toBe('WHI')
    })
    it('should render without a label', () => {
        const { container } = render(<KitShirt color="#3a6ea5" />)
        expect(container.querySelector('text')).toBeNull()
    })
    it('should fill multicolour kits with stripes', () => {
        const { container } = render(<KitShirt color="multi" label="1" />)
        expect(container.querySelector('linearGradient, lineargradient')).not.toBeNull()
    })
})
