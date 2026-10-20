import { useEffect, useRef, type RefObject } from 'react'
import { useAppState } from '../state'
import { NO_FILL, nextFill, type FillMemory } from '../utils/landscapeFill'
import { isRealFullscreen, requestRealFullscreen } from './fullscreen'
import { useLayout, useMediaQuery, COARSE_QUERY } from './useMediaQuery'

interface FillPlayer { exitFullscreen: () => unknown }

/**
 * Touch phone turned sideways with a video loaded: fill the screen at once (CSS immersive: no gesture needed), and ask for real
 * fullscreen on the next tap (browsers need a user gesture; a refusal leaves immersive on). Turning back to portrait leaves a fill
 * the app made; fullscreen the user chose in portrait stays. Leaving the fill while still sideways (exit button, Back) stays out
 * until the next rotation. Rules: utils/landscapeFill.ts.
 */
export function useLandscapeFill(containerRef: RefObject<HTMLElement | null>, playerRef: RefObject<FillPlayer | null>): void {
    const coarse = useMediaQuery(COARSE_QUERY)
    const layout = useLayout()
    const hasFiles = useAppState((s) => s.files.length > 0)
    const fullscreen = useAppState((s) => s.playerFullscreen || s.immersive)
    const landscape = coarse && layout === 'landscape' && hasFiles
    const mem = useRef<FillMemory>(NO_FILL)
    const wantReal = useRef(false) // an automatic fill is waiting for (or holds) real fullscreen

    // Unmounting (the player ends immersive itself) forgets the memory, so a remount in landscape fills again.
    useEffect(() => () => { mem.current = NO_FILL; wantReal.current = false }, [])
    useEffect(() => {
        const r = nextFill(mem.current, { landscape, fullscreen })
        mem.current = r.mem
        if (r.action === 'enter') { wantReal.current = true; useAppState.getState().setImmersive(true) }
        else if (r.action === 'exit') { wantReal.current = false; playerRef.current?.exitFullscreen() }
        else if (!r.mem.auto) wantReal.current = false
    }, [landscape, fullscreen, playerRef])

    // The first tap after the rotation asks for real fullscreen (touch activation happens on release).
    useEffect(() => {
        if (!landscape) return
        const onUp = (): void => {
            if (!wantReal.current || !mem.current.auto) return
            const el = containerRef.current
            if (!el || isRealFullscreen(el)) { wantReal.current = false; return }
            requestRealFullscreen(el)
        }
        window.addEventListener('pointerup', onUp, true)
        return () => window.removeEventListener('pointerup', onUp, true)
    }, [landscape, containerRef])

    // Android Back (or any other way out of real fullscreen) while the fill is on: leave the fill as well, and stay out.
    useEffect(() => {
        let wasReal = false
        const onChange = (): void => {
            const real = isRealFullscreen(containerRef.current)
            if (wasReal && !real && useAppState.getState().immersive) { wantReal.current = false; playerRef.current?.exitFullscreen() }
            wasReal = real
        }
        document.addEventListener('fullscreenchange', onChange)
        document.addEventListener('webkitfullscreenchange', onChange)
        return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('webkitfullscreenchange', onChange) }
    }, [containerRef, playerRef])
}
