// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AiTag } from './AiTag'
import { BetaTag } from './BetaTag'

describe('AiTag and BetaTag', () => {
    it('should say what the AI tag means, in its title and for screen readers', () => {
        render(<AiTag />)
        expect(screen.getByTitle('Finds likely goals with AI on this device — check each one')).toHaveTextContent('AI')
        expect(screen.getByText(/check each one/)).toBeTruthy()
    })
    it('should explain the Beta tag in its title', () => {
        render(<BetaTag />)
        expect(screen.getByTitle('Shooot is in beta: things may change')).toHaveTextContent('Beta')
    })
})
