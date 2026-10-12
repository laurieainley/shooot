import { useEffect, useMemo, useRef, useState } from 'react'
import { ensureGraphicsFonts, loadLogo } from '../graphics/assets'
import { loadCustomLogo } from '../graphics/logoStore'
import { DESIGN_H, DESIGN_W, SAFE_X, SAFE_Y } from '../graphics/layout'
import type { PaintAssets } from '../graphics/paint'
import { getTheme } from '../graphics/themes'
import type { BugSpec } from '../graphics/types'
import { selectClockLong, useAppState } from '../state'
import { scorebugModel } from '../utils/playerScorebug'

/** Design-space window the canvas covers: the bug's row plus margin for its lean and shadow; wide enough for the longest bug. */
const WIN_X = SAFE_X - 24
const WIN_Y = SAFE_Y - 12
const WIN_W = 1000
/** Smallest design pixel in CSS px (keeps the bug readable on phones). */
const MIN_U = 0.34

/** Rightmost opaque column (in canvas px) of what the painter drew, or 0. */
function inkRight(ctx: CanvasRenderingContext2D, w: number, h: number): number {
    try {
        const data = ctx.getImageData(0, 0, w, h).data
        for (let x = w - 1; x >= 0; x--) {
            for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] > 8) return x + 1
        }
    } catch { /* unreadable canvas: no clock beside it */ }
    return 0
}

/**
 * The score bug in the top-left of the picture (normal and fullscreen). It is the selected graphics theme's own score
 * bug painter drawn onto a canvas (same code as the exported video, so colours, fonts, shape and kit bars match), scaled
 * from the picture's width. The match clock follows it as text (the export has none). Redraws only when the bug's
 * content, theme, size or fonts change - never per animation frame. Never takes pointer events.
 */
export function Scorebug() {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const playheadSec = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const clockLong = useAppState(selectClockLong)
    const themeId = useAppState((s) => s.graphics.theme)
    const model = useMemo(() => scorebugModel({ teams, events, offsets, playheadSec, clockLong }), [teams, events, offsets, playheadSec, clockLong])

    const layerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const offRef = useRef<HTMLCanvasElement | null>(null)
    const [layerW, setLayerW] = useState(0)
    const [dpr, setDpr] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
    const [ready, setReady] = useState<{ theme: string; assets: PaintAssets } | null>(null)
    const [rightDesign, setRightDesign] = useState(0)

    const shown = !!model
    const theme = useMemo(() => getTheme(themeId), [themeId])

    useEffect(() => {
        const layer = layerRef.current
        if (!layer) return
        const measure = () => { setLayerW(layer.clientWidth); setDpr(window.devicePixelRatio || 1) }
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(measure)
        ro.observe(layer)
        return () => ro.disconnect()
    }, [shown])

    // Fonts and the league logo for the theme, before painting (otherwise text would use a fallback face).
    useEffect(() => {
        if (!shown) return
        let live = true
        void (async () => {
            try { await ensureGraphicsFonts(theme) } catch { /* painters fall back to measured metrics */ }
            let logo: ImageBitmap | null = null
            try { logo = await loadLogo(await loadCustomLogo()) } catch { /* no logo */ }
            if (live) setReady({ theme: theme.id, assets: { logo } })
        })()
        return () => { live = false }
    }, [shown, theme])

    const bug: BugSpec | null = model?.bug ?? null
    const bugKey = bug ? JSON.stringify(bug) : ''
    const u = Math.max(layerW / DESIGN_W, MIN_U)
    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx || !bug || !layerW || !ready || ready.theme !== theme.id) return
        // Painters fit the 1920x1080 design into whatever canvas they get, so paint a whole frame off-screen at the
        // on-screen scale (capped), then copy just the bug's window into the visible canvas.
        const k = Math.min(u * dpr, 2.2)
        const off = (offRef.current ??= document.createElement('canvas'))
        off.width = Math.round(DESIGN_W * k)
        off.height = Math.round(DESIGN_H * k)
        const octx = off.getContext('2d')
        if (!octx) return
        theme.paintScoreBug(octx, bug, 0, 1, false, ready.assets)
        const w = Math.ceil(WIN_W * k)
        const h = Math.ceil((theme.rows.bug[1] - WIN_Y + 12) * k)
        canvas.width = w
        canvas.height = h
        ctx.drawImage(off, WIN_X * k, WIN_Y * k, w, h, 0, 0, w, h)
        off.width = off.height = 0 // release the frame-sized buffer
        setRightDesign(inkRight(ctx, w, h) / k + WIN_X)
        // bug is represented by bugKey
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bugKey, theme, u, dpr, ready, layerW])

    if (!model) return null

    const rowMid = (theme.rows.bug[0] + theme.rows.bug[1]) / 2
    return (
        <div ref={layerRef} className="scorebug-layer">
            <div role="status" aria-label={model.label} title={model.label} className="scorebug" style={{ ['--u' as string]: `${u}px` }}>
                <canvas
                    ref={canvasRef}
                    className="scorebug__canvas"
                    aria-hidden="true"
                    style={{ left: `calc(var(--u) * ${WIN_X - SAFE_X})`, top: `calc(var(--u) * ${WIN_Y - SAFE_Y})`, width: `calc(var(--u) * ${WIN_W})` }}
                />
                {model.clock && rightDesign > 0 && (
                    <span className="scorebug__clock tc" style={{ left: `calc(var(--u) * ${rightDesign - SAFE_X + 20})`, top: `calc(var(--u) * ${rowMid - SAFE_Y})` }}>{model.clock}</span>
                )}
            </div>
        </div>
    )
}
