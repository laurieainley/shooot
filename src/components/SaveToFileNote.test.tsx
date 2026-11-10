// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const importedParts = vi.fn()
vi.mock('../render/unitCache', () => ({ importedParts: () => importedParts() }))

import { SaveToFileNote } from './SaveToFileNote'

describe('SaveToFileNote', () => {
    it('should say that parts from another device are not used when saving straight to a file', async () => {
        importedParts.mockResolvedValue({ device: 'iPad', units: 7 })
        render(<SaveToFileNote />)
        expect(await screen.findByText('Prepared parts from iPad aren’t used when saving straight to a file.')).toBeInTheDocument()
    })
    it('should say nothing without loaded parts', async () => {
        importedParts.mockResolvedValue(null)
        const { container } = render(<SaveToFileNote />)
        await Promise.resolve()
        expect(container).toBeEmptyDOMElement()
    })
})
