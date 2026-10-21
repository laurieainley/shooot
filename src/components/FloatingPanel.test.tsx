// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { FloatingPanel } from './FloatingPanel'

describe('FloatingPanel', () => {
    it('should close on Escape', () => {
        const onClose = vi.fn()
        render(<FloatingPanel label="P" anchorRef={createRef()} placement="below" onClose={onClose}><button>in</button></FloatingPanel>)
        fireEvent.keyDown(screen.getByText('in'), { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should leave Escape to a child that owns it', () => {
        const onClose = vi.fn()
        render(<FloatingPanel label="P" anchorRef={createRef()} placement="below" onClose={onClose}><div data-owns-escape><button>in</button></div></FloatingPanel>)
        fireEvent.keyDown(screen.getByText('in'), { key: 'Escape' })
        expect(onClose).not.toHaveBeenCalled()
    })

    it('should close on a press outside, but not on a layer opened over it (e.g. the large thumbnail preview)', () => {
        const onClose = vi.fn()
        render(<>
            <FloatingPanel label="P" anchorRef={createRef()} placement="below" onClose={onClose}><button>in</button></FloatingPanel>
            <div data-over-panel><button>over</button></div>
            <button>elsewhere</button>
        </>)
        fireEvent.pointerDown(screen.getByText('over'))
        expect(onClose).not.toHaveBeenCalled()
        fireEvent.pointerDown(screen.getByText('elsewhere'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
