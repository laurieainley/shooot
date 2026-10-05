// video.js fullscreens its own element, which hides our overlays (picker, ＋, speed).
// Redirect its fullscreen API to the app's player container.

export type FullscreenPlayer = {
    requestFullscreen: () => unknown
    exitFullscreen: () => unknown
    isFullscreen: (value?: boolean) => boolean
    trigger: (event: string) => unknown
}

type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void }
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void }

function docFullscreenElement(): Element | null {
    const d = document as WebkitDocument
    return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

function isTouchScreen(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

// Phones: watching a match is a landscape job. Browsers may refuse (iOS, not installed as an app); that's fine.
function lockLandscape(): void {
    if (!isTouchScreen()) return
    try {
        const o = screen.orientation as LockableOrientation | undefined
        void o?.lock?.('landscape')?.catch(() => undefined)
    } catch { /* not supported */ }
}

function unlockOrientation(): void {
    try { (screen.orientation as LockableOrientation | undefined)?.unlock?.() } catch { /* not supported */ }
}

export function patchPlayerFullscreen(player: FullscreenPlayer, getContainer: () => HTMLElement | null): () => void {
    const setVjsClass = player.isFullscreen.bind(player)
    const containerIsFullscreen = (): boolean => {
        const el = docFullscreenElement()
        return el !== null && el === getContainer()
    }

    player.requestFullscreen = () => {
        const el = getContainer() as WebkitElement | null
        if (!el || containerIsFullscreen()) return
        if (el.requestFullscreen) void el.requestFullscreen().then(lockLandscape, () => undefined)
        else el.webkitRequestFullscreen?.()
    }
    player.exitFullscreen = () => {
        unlockOrientation()
        const d = document as WebkitDocument
        if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined)
        else d.webkitExitFullscreen?.()
    }
    player.isFullscreen = (value?: boolean) => {
        if (value !== undefined) return setVjsClass(value)
        return containerIsFullscreen()
    }

    // Always derive the state from the document, never from what we last saw: rotating a phone can leave
    // fullscreen without an event reaching us, and stale state made the next fullscreen request a no-op.
    let last = containerIsFullscreen()
    const sync = (force: boolean): void => {
        const now = containerIsFullscreen()
        if (!force && now === last) return
        last = now
        setVjsClass(now)
        player.trigger('fullscreenchange')
    }
    const onChange = (): void => sync(true)
    const onResize = (): void => sync(setVjsClass() !== containerIsFullscreen())
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
        document.removeEventListener('fullscreenchange', onChange)
        document.removeEventListener('webkitfullscreenchange', onChange)
        window.removeEventListener('resize', onResize)
        window.removeEventListener('orientationchange', onResize)
    }
}
