// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppState } from '../state'
import { EmptyPlayer } from './EmptyPlayer'

describe('EmptyPlayer', () => {
    beforeEach(() => useAppState.setState({ files: [], opening: null }))

    it('should offer to choose files', () => {
        render(<EmptyPlayer />)
        expect(screen.getByRole('button', { name: 'Choose files' })).toBeEnabled()
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('should show a loading row while files are opened and disable Choose files', () => {
        useAppState.setState({ opening: 'Opening GX010226.MP4 (11.9 GB)…' })
        render(<EmptyPlayer />)
        expect(screen.getByRole('status')).toHaveTextContent('Opening GX010226.MP4 (11.9 GB)…')
        expect(screen.getByRole('button', { name: 'Choose files' })).toBeDisabled()
    })
})
