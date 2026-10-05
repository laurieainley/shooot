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

/** CSS "immersive" mode: the player fills the viewport without the Fullscreen API (iPhone, or a refused request). */
export type ImmersiveMode = { get: () => boolean; set: (on: boolean) => void }

const NO_IMMERSIVE: ImmersiveMode = { get: () => false, set: () => undefined }

export function patchPlayerFullscreen(
    player: FullscreenPlayer,
    getContainer: () => HTMLElement | null,
    immersive: ImmersiveMode = NO_IMMERSIVE,
): () => void {
    const setVjsClass = player.isFullscreen.bind(player)
    const containerIsFullscreen = (): boolean => {
        const el = docFullscreenElement()
        return el !== null && el === getContainer()
    }
    const setImmersive = (on: boolean): void => {
        if (immersive.get() === on) return
        immersive.set(on)
        setVjsClass(on)
        player.trigger('fullscreenchange')
    }
    const fallBack = (): void => setImmersive(true)

    // Called straight from the tap / click handler: requestFullscreen must run synchronously inside the user
    // gesture (no awaits before it). Any refusal — rejected promise, exception, no API — ends in immersive mode.
    player.requestFullscreen = () => {
        const el = getContainer() as WebkitElement | null
        if (!el || containerIsFullscreen() || immersive.get()) return
        try {
            if (typeof el.requestFullscreen === 'function') {
                const pending = el.requestFullscreen({ navigationUI: 'hide' })
                if (pending && typeof pending.then === 'function') pending.then(lockLandscape, fallBack)
                else lockLandscape()
                return
            }
            if (typeof el.webkitRequestFullscreen === 'function') { el.webkitRequestFullscreen(); return }
        } catch { /* refused: fall through */ }
        fallBack()
    }
    player.exitFullscreen = () => {
        if (immersive.get()) { setImmersive(false); return }
        unlockOrientation()
        const d = document as WebkitDocument
        if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined)
        else d.webkitExitFullscreen?.()
    }
    player.isFullscreen = (value?: boolean) => {
        if (value !== undefined) return setVjsClass(value)
        return containerIsFullscreen() || immersive.get()
    }

    // Always derive the state from the document, never from what we last saw: rotating a phone can leave
    // fullscreen without an event reaching us, and stale state made the next fullscreen request a no-op.
    let last = containerIsFullscreen()
    const sync = (force: boolean): void => {
        const now = containerIsFullscreen() || immersive.get()
        if (!force && now === last) return
        last = now
        setVjsClass(now)
        player.trigger('fullscreenchange')
    }
    const onChange = (): void => sync(true)
    const onResize = (): void => { if (!immersive.get()) sync(setVjsClass() !== containerIsFullscreen()) }
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
