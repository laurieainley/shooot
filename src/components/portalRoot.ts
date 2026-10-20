import { useFullscreenUi } from './fullscreenUi'
import { COARSE_QUERY } from './useMediaQuery'

/**
 * Where sheets and menus are portalled. Normally the page body; on touch, while the player fills the screen (fullscreen, or
 * the immersive landscape view) the player itself: only the fullscreen element is on screen in real fullscreen, and the
 * immersive view sits over the page.
 */
export function portalRoot(): HTMLElement {
    const host = useFullscreenUi.getState().host
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia(COARSE_QUERY).matches
    return host && coarse && host.isConnected ? host : document.body
}
