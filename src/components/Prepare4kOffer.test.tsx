// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Prepare4kOffer } from './Prepare4kOffer'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'

describe('Prepare4kOffer', () => {
    const media = (coarse: boolean): void => { vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse') ? coarse : false, addEventListener: () => undefined, removeEventListener: () => undefined })) }
    const mp4 = (w: number, h: number): VideoSourceFile => ({ id: 'a', name: 'GX010042.MP4', url: '', file: new File([''], 'GX010042.MP4'), kind: 'full', width: w, height: h })
    const set = (files: VideoSourceFile[], quality: 'original' | '4k' | '1080p', hq: 'auto' | '1080p' = 'auto'): void => {
        act(() => { useAppState.setState({ files, fullMatch: { ...useAppState.getState().fullMatch, quality }, highlightsQuality: hq }) })
    }
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); set([], 'original') })

        it('should offer Prepare 4K for Original with 4K footage, and set 4K on tap', async () => {
            media(true)
            set([mp4(3840, 2160)], 'original')
            render(<Prepare4kOffer />)
            const b = screen.getByRole('button', { name: 'Prepare 4K' })
            expect(b).toHaveAccessibleDescription('Starts encoding the 4K full match now so Export is quicker later.')
            expect(screen.getByText('Starts encoding the 4K full match now so Export is quicker later.')).toBeVisible()
            await userEvent.click(b)
            expect(useAppState.getState().fullMatch.quality).toBe('4k')
            expect(useAppState.getState().highlightsQuality).toBe('4k')
        })
        it('should leave an explicit 1080p highlights choice alone', async () => {
            media(true)
            set([mp4(3840, 2160)], 'original', '1080p')
            render(<Prepare4kOffer />)
            await userEvent.click(screen.getByRole('button', { name: 'Prepare 4K' }))
            expect(useAppState.getState().highlightsQuality).toBe('1080p')
        })
        it('should not offer it with a mouse, for 1080p footage, or once the quality is chosen', () => {
            media(false)
            set([mp4(3840, 2160)], 'original')
            const a = render(<Prepare4kOffer />)
            expect(a.container).toBeEmptyDOMElement()
            a.unmount()
            media(true)
            set([mp4(1920, 1080)], 'original')
            const b = render(<Prepare4kOffer />)
            expect(b.container).toBeEmptyDOMElement()
            b.unmount()
            set([mp4(3840, 2160)], '1080p')
            expect(render(<Prepare4kOffer />).container).toBeEmptyDOMElement()
        })
})
