import { useEffect } from 'react'
import { create } from 'zustand'
import { useAppState } from '../state'
import { tagViewMode, type TagViewMode } from '../utils/tagView'
import { pausePlayer } from './playerControl'
import { COARSE_QUERY, useLayout, useMediaQuery } from './useMediaQuery'

/** How the touch player is laid out right now (see utils/tagView.ts): overlay, band under the picture, or off (mouse). */
export function useTagViewMode(): TagViewMode {
    const coarse = useMediaQuery(COARSE_QUERY)
    const layout = useLayout()
    const fullscreen = useAppState((s) => s.playerFullscreen || s.immersive)
    const hasFiles = useAppState((s) => s.files.length > 0)
    return tagViewMode({ coarse, layout, fullscreen, hasFiles })
}

/** Tag: pauses, stamps the playhead time and opens the Tag column. No event exists until a type is chosen. */
export function startTag(): void {
    const st = useAppState.getState()
    if (st.files.length === 0 || st.picker) return
    if (st.panel === 'review') st.closePanel() // the Find goals sheet is not part of tagging
    pausePlayer()
    st.markEvent(st.currentTimeInFileSec, { deferred: true })
}

/**
 * Touch-view UI state (never persisted):
 * sheet - the events list / matches overlay opened from ⋯ (landscape view has no rail);
 * menuOpen - the ⋯ menu;
 * controlsVisible - the overlay controls: they never hide by themselves; a single tap on the picture hides / shows them.
 */
interface TagUi {
    sheet: 'events' | 'matches' | null
    menuOpen: boolean
    controlsVisible: boolean
    setSheet: (sheet: 'events' | 'matches' | null) => void
    setMenuOpen: (open: boolean) => void
    setControlsVisible: (visible: boolean) => void
    poke: () => void
}

export const useTagUi = create<TagUi>((set) => ({
    sheet: null,
    menuOpen: false,
    controlsVisible: true,
    setSheet: (sheet) => set({ sheet }),
    setMenuOpen: (menuOpen) => set({ menuOpen }),
    setControlsVisible: (controlsVisible) => set({ controlsVisible }),
    poke: () => set({ controlsVisible: true }),
}))

/**
 * Whether the overlay controls are showing. There is no auto-hide: they stay as the user left them (hidden only by a single tap
 * on the picture, shown by the next one). Back to visible whenever the controls are not over the picture (portrait band).
 */
export function useControlsVisibility(overlayView: boolean): boolean {
    const visible = useTagUi((s) => s.controlsVisible)
    useEffect(() => { if (!overlayView) useTagUi.getState().setControlsVisible(true) }, [overlayView])
    return visible
}
