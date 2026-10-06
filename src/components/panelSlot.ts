import { create } from 'zustand'

/**
 * Where the add / edit panels live.
 * popover - mouse: next to the picture, as before
 * column  - touch, not fullscreen: replaces the events column (side by side) or the events area (stacked)
 * compact - touch, fullscreen: a small overlay on the side away from the action, clear of the picture's centre
 */
export type PanelPlacement = 'popover' | 'column' | 'compact'

export function panelPlacement(coarse: boolean, fullscreen: boolean): PanelPlacement {
    if (!coarse) return 'popover'
    return fullscreen ? 'compact' : 'column'
}

/** The element in the rail / stack the column panels render into (set by AppShell). */
export const usePanelSlot = create<{ el: HTMLElement | null; setEl: (el: HTMLElement | null) => void }>((set) => ({
    el: null,
    setEl: (el) => set({ el }),
}))
