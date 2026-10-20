import { create } from 'zustand'

/**
 * UI-only state for the player's fullscreen (never persisted):
 * host - the element that is fullscreen (the player container); column panels render into it so they are visible in real fullscreen;
 * reviewHidden - the review column is tucked away without leaving fullscreen (the Review button brings it back);
 * columnPanel - which column panel is visible inside the fullscreen element (null: none, or tucked away);
 * playbackLocked - a single tap on the picture no longer plays / pauses.
 */
interface FullscreenUi {
    host: HTMLElement | null
    reviewHidden: boolean
    columnPanel: 'review' | 'other' | null
    playbackLocked: boolean
    setColumnPanel: (panel: 'review' | 'other' | null) => void
    setHost: (el: HTMLElement | null) => void
    setReviewHidden: (hidden: boolean) => void
    setPlaybackLocked: (locked: boolean) => void
}

export const useFullscreenUi = create<FullscreenUi>((set) => ({
    host: null,
    reviewHidden: false,
    columnPanel: null,
    playbackLocked: false,
    setColumnPanel: (columnPanel) => set({ columnPanel }),
    setHost: (host) => set({ host }),
    setReviewHidden: (reviewHidden) => set({ reviewHidden }),
    setPlaybackLocked: (playbackLocked) => set({ playbackLocked }),
}))

export interface SplitInput {
    inFullscreen: boolean
    coarse: boolean
    tagging: boolean
    columnPanel: 'review' | 'other' | null
}

/** Touch fullscreen with a panel or the tag box open: the picture shrinks to the free space instead of being covered. */
export function fullscreenSplit({ inFullscreen, coarse, tagging, columnPanel }: SplitInput): boolean {
    return inFullscreen && coarse && (tagging || columnPanel !== null)
}
