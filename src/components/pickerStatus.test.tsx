// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useAppState } from '../state'
import { OpeningStatus } from './OpeningStatus'
import { openMediaPicker, notePicked } from './pickerStatus'

const GB = 1024 ** 3
const bigFile = (): File => { const f = new File(['x'], 'GX010001.MP4'); Object.defineProperty(f, 'size', { value: 3 * GB }); return f }

function setUA(ua: string): void {
    vi.stubGlobal('navigator', { userAgent: ua, platform: 'iPad', maxTouchPoints: 5 })
}

describe('picker status on iPadOS', () => {
    beforeEach(() => { useAppState.setState({ pickerWait: false, pickerNotice: null, opening: null }) })
    afterEach(() => { vi.unstubAllGlobals() })

    it('should show a waiting spinner from picker open until the change event', () => {
        setUA('Mozilla/5.0 (iPad; CPU OS 17_0)')
        const input = document.createElement('input')
        input.click = vi.fn()
        render(<OpeningStatus />)
        act(() => openMediaPicker(input))
        expect(screen.getByRole('status')).toHaveTextContent('Waiting for iPadOS to hand over the files…')
        act(() => notePicked([new File(['x'], 'a.MP4')]))
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('should clear the waiting spinner when the picker is cancelled', () => {
        setUA('Mozilla/5.0 (iPad; CPU OS 17_0)')
        const input = document.createElement('input')
        input.click = vi.fn()
        render(<OpeningStatus />)
        act(() => openMediaPicker(input))
        act(() => { input.dispatchEvent(new Event('cancel')) })
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('should show the large-file hint when a picked file is over 2 GB', () => {
        setUA('Mozilla/5.0 (iPad; CPU OS 17_0)')
        render(<OpeningStatus />)
        act(() => notePicked([bigFile()]))
        expect(screen.getByText(/iPadOS copies files before the app can open them/)).toBeInTheDocument()
    })

    it('should do nothing on other devices', () => {
        setUA('Mozilla/5.0 (Windows NT 10.0)')
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0 })
        const input = document.createElement('input')
        input.click = vi.fn()
        render(<OpeningStatus />)
        act(() => openMediaPicker(input))
        expect(input.click).toHaveBeenCalled()
        act(() => notePicked([bigFile()]))
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
})

describe('file inputs on iPadOS', () => {
    afterEach(() => { vi.unstubAllGlobals() })

    it('should carry no accept attribute on iPad and the extension list elsewhere', async () => {
        const { AddFilesButton } = await import('./FilePills')
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)', platform: 'iPad', maxTouchPoints: 5 })
        const ipad = render(<AddFilesButton />)
        expect(ipad.container.querySelector('input[type=file]')).not.toHaveAttribute('accept')
        ipad.unmount()
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0 })
        const pc = render(<AddFilesButton />)
        expect(pc.container.querySelector('input[type=file]')).toHaveAttribute('accept', '.mp4,.MP4,.lrv,.LRV')
    })
})
