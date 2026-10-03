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

function docFullscreenElement(): Element | null {
    const d = document as WebkitDocument
    return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function patchPlayerFullscreen(player: FullscreenPlayer, getContainer: () => HTMLElement | null): () => void {
    const setVjsClass = player.isFullscreen.bind(player)

    player.requestFullscreen = () => {
        const el = getContainer() as WebkitElement | null
        if (!el) return
        if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined)
        else el.webkitRequestFullscreen?.()
    }
    player.exitFullscreen = () => {
        const d = document as WebkitDocument
        if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined)
        else d.webkitExitFullscreen?.()
    }
    player.isFullscreen = (value?: boolean) => {
        if (value !== undefined) return setVjsClass(value)
        return docFullscreenElement() !== null
    }

    const onChange = (): void => {
        setVjsClass(docFullscreenElement() !== null)
        player.trigger('fullscreenchange')
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
        document.removeEventListener('fullscreenchange', onChange)
        document.removeEventListener('webkitfullscreenchange', onChange)
    }
}
