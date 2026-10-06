// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayIndicator } from './PlayIndicator'

describe('PlayIndicator', () => {
    it('should show a play icon while the video is paused', () => {
        render(<PlayIndicator visible />)
        expect(screen.getByTestId('play-indicator')).toBeInTheDocument()
    })

    it('should show nothing while the video plays or is being scrubbed', () => {
        render(<PlayIndicator visible={false} />)
        expect(screen.queryByTestId('play-indicator')).not.toBeInTheDocument()
    })
})
