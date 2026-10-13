import { create } from 'zustand'

/**
 * UI-only state for the player's fullscreen (never persisted):
 * host - the element that is fullscreen (the player container); column panels render into it so they are visible in real fullscreen;
 * reviewHidden - the review column is tucked away without leaving fullscreen (the Review button brings it back);
 * playbackLocked - a single tap on the picture no longer plays / pauses.
 */
interface FullscreenUi {
    host: HTMLElement | null
    reviewHidden: boolean
    playbackLocked: boolean
    setHost: (el: HTMLElement | null) => void
    setReviewHidden: (hidden: boolean) => void
    setPlaybackLocked: (locked: boolean) => void
}

export const useFullscreenUi = create<FullscreenUi>((set) => ({
    host: null,
    reviewHidden: false,
    playbackLocked: false,
    setHost: (host) => set({ host }),
    setReviewHidden: (reviewHidden) => set({ reviewHidden }),
    setPlaybackLocked: (playbackLocked) => set({ playbackLocked }),
}))
