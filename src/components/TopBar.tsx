import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state'
import { nextBarVisible } from '../utils/barScroll'
import { ExportPanel } from './ExportPanel'
import { FilePills } from './FilePills'
import { OverflowMenu } from './OverflowMenu'
import { ScoreBadge } from './ScoreBadge'
import { RenderChip } from './RenderChip'
import type { Layout } from './useMediaQuery'

interface TopBarProps {
    layout: Layout
}

/** Portrait phones: the sticky bar slides away while scrolling down the page and returns on any scroll up. */
function useHideOnScroll(enabled: boolean): boolean {
    const [visible, setVisible] = useState(true)
    const lastY = useRef(0)
    useEffect(() => {
        if (!enabled) { setVisible(true); return }
        lastY.current = window.scrollY
        const onScroll = (): void => {
            const y = window.scrollY
            setVisible((v) => nextBarVisible(v, lastY.current, y))
            lastY.current = y
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [enabled])
    return visible
}

export function TopBar({ layout }: TopBarProps) {
    const visible = useHideOnScroll(layout === 'phone')
    // Never slide away while a menu or sheet anchored to it is open.
    const panelOpen = useAppState((s) => s.panel !== null)
    const hidden = !visible && !panelOpen

    return (
        <header className={`top-bar${hidden ? ' top-bar--hidden' : ''}`}>
            <span className="brand" aria-label="Shooot">SHOOOT</span>
            {layout === 'desktop' ? (
                <>
                    <div className="top-bar__files"><FilePills /></div>
                    <ScoreBadge />
                    <span className="top-bar__actions">
                        <RenderChip />
                        <button type="button" onClick={() => useAppState.getState().openPanel('match')} className="btn-quiet">Match</button>
                        <ExportPanel />
                        <OverflowMenu />
                    </span>
                </>
            ) : (
                <>
                    <span className="flex-1" />
                    <ScoreBadge compact />
                    <RenderChip />
                    <ExportPanel />
                    <OverflowMenu />
                    {layout === 'landscape' && (
                        <button type="button" aria-label="Hide top bar" title="Hide the top bar for more picture"
                            className="btn-icon" onClick={() => useAppState.getState().setBarCollapsed(true)}>
                            <Chevron up />
                        </button>
                    )}
                </>
            )}
        </header>
    )
}

interface ChevronProps {
    up?: boolean
}

export function Chevron({ up = false }: ChevronProps) {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d={up ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
