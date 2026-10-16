import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppState } from '../state'
import { ensureGraphicsFonts, loadLogo } from '../graphics/assets'
import { loadCustomLogo } from '../graphics/logoStore'
import { getTheme } from '../graphics/themes'
import { canvasMeasure, drawCover, paintThumbnailOps } from '../graphics/thumbnail/paint'
import type { CropRect } from '../types'
import { thumbnailLayoutFor } from '../graphics/thumbnail/registry'
import { THUMB_H, THUMB_W, type ThumbSpec } from '../graphics/thumbnail/types'
import { thumbnailZoomCrop } from '../utils/attack'
import {
    NO_PAN, THUMB_FINE_MAX_SEC, THUMB_FINE_STEP_SEC, clampPan, coverSpan, defaultPickIndex, panCrop, pickTime, thumbnailFileName, thumbnailPicks, type CropPan,
} from '../utils/thumbnailPicks'
import { ThumbnailPreview } from './ThumbnailPreview'
import { useThumbFrame } from './thumbnailFrame'

interface ThumbnailMakerProps {
    kind: 'highlights' | 'fullMatch'
}

/** The default headline as the field shows it: "Whites v Colours". */
function teamLine(a?: string, b?: string): string {
    return `${a?.trim() || 'Team 1'} v ${b?.trim() || 'Team 2'}`
}

const CUSTOM_MAX_CHARS = 60
const MAX_BYTES = 1_900_000

/** The thumbnail as a JPEG under YouTube's 2 MB limit (quality steps down until it fits). */
async function jpegUnderLimit(canvas: HTMLCanvasElement): Promise<Blob | null> {
    for (const q of [0.92, 0.85, 0.78, 0.7, 0.6]) {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
        if (blob && blob.size <= MAX_BYTES) return blob
        if (q === 0.6) return blob
    }
    return null
}

/**
 * Export, YouTube thumbnail: a frame of any tagged moment (for a goal, the ball just before it crosses the line) with
 * the video kind in the corner and the teams' names (never the score), drawn in the chosen graphics style. Flip between
 * moments, nudge the frame, zoom to a goal area and drag the picture to place it, look at it larger, download a
 * 1280×720 JPEG.
 */
export function ThumbnailMaker({ kind }: ThumbnailMakerProps) {
    const st = useAppState(useShallow((s) => ({
        files: s.files, events: s.events, cumulativeOffsets: s.cumulativeOffsets, teams: s.teams, matchdayLabel: s.matchdayLabel,
        themeId: s.graphics.theme, areas: s.goalAreas,
    })))
    const [open, setOpen] = useState(false)
    const [index, setIndex] = useState<number | null>(null)
    const [pans, setPans] = useState<Record<string, CropPan>>({})
    const [dragging, setDragging] = useState(false)
    const [preview, setPreview] = useState<string | null>(null)
    const [fine, setFine] = useState(0)
    const [zoom, setZoom] = useState(false)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState('')
    const [customOn, setCustomOn] = useState(false)
    const [customText, setCustomText] = useState('')
    const [ready, setReady] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const logoRef = useRef<{ done: boolean; bitmap: ImageBitmap | null }>({ done: false, bitmap: null })
    const dragRef = useRef<{ x: number; y: number; pan: CropPan } | null>(null)
    // What a redraw needs, kept current each render so the drag can repaint without waiting for React.
    const paintRef = useRef<{ image: HTMLImageElement | null; spec: ThumbSpec; theme: ReturnType<typeof getTheme>; crop: CropRect | null; zoomed: boolean }>(null!)

    const picks = useMemo(() => thumbnailPicks(st.events, st.cumulativeOffsets, st.files), [st.events, st.cumulativeOffsets, st.files])
    const at = Math.min(index ?? defaultPickIndex(picks), Math.max(0, picks.length - 1))
    const cur = picks[at] ?? null
    const file = cur ? st.files[cur.fileIndex] : undefined
    const atSec = cur && file ? (cur.event ? pickTime(cur.event.matchTimeSec, file.durationSec, fine) : pickTime(cur.timeSec + 0.25, file.durationSec, fine)) : null
    const baseCrop = useMemo(
        () => thumbnailZoomCrop({ events: st.events, teams: st.teams, cumulativeOffsets: st.cumulativeOffsets, areas: st.areas }, cur?.event ?? null),
        [cur, st.events, st.teams, st.cumulativeOffsets, st.areas],
    )
    const zoomed = zoom && baseCrop !== null
    const pan = baseCrop && cur ? clampPan(baseCrop, pans[cur.id] ?? NO_PAN) : NO_PAN
    const crop = baseCrop ? panCrop(baseCrop, pan) : null

    // Full-quality file first when a proxy is playing; then whatever is playing.
    const urls = useMemo(() => {
        if (!file) return []
        const list: string[] = []
        if (file.fullFile) list.push(URL.createObjectURL(file.fullFile))
        list.push(file.url)
        return list
    }, [file])
    useEffect(() => () => { for (const u of urls) if (u.startsWith('blob:') && u !== file?.url) URL.revokeObjectURL(u) }, [urls, file])

    const frame = useThumbFrame(open ? urls : [], open ? atSec : null, zoomed ? 3840 : 1920)

    const defaultLine = teamLine(st.teams[0]?.name, st.teams[1]?.name)
    const spec: ThumbSpec = {
        kind, team1: st.teams[0]?.name ?? '', team2: st.teams[1]?.name ?? '', title: st.matchdayLabel?.trim() || null, hasLogo: true,
        headline: customOn && customText.trim() ? customText.trim() : null,
    }
    const specKey = JSON.stringify(spec)

    const theme = getTheme(st.themeId)
    paintRef.current = { image: frame.image, spec, theme, crop: zoomed ? crop : null, zoomed }

    /** Paints the current picture and graphics at once, with the theme's fonts and the logo already loaded. */
    const paintNow = (cropOverride?: CropRect): boolean => {
        const canvas = canvasRef.current
        const { image, spec: sp, theme: th, crop: c } = paintRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx || !image || !logoRef.current.done) return false
        ctx.clearRect(0, 0, THUMB_W, THUMB_H)
        drawCover(ctx, image, image.naturalWidth, image.naturalHeight, cropOverride ?? c)
        const logo = logoRef.current.bitmap
        paintThumbnailOps(ctx, thumbnailLayoutFor(th.id)({ ...sp, hasLogo: !!logo }, canvasMeasure(ctx)), logo)
        return true
    }

    useEffect(() => {
        const image = frame.image
        if (!open || !canvasRef.current || !image) return
        let live = true
        void (async () => {
            await ensureGraphicsFonts(getTheme(st.themeId))
            if (!logoRef.current.done) {
                logoRef.current = { done: true, bitmap: await loadLogo(await loadCustomLogo()) }
            }
            if (!live) return
            if (paintNow()) setReady(true)
        })()
        return () => { live = false }
    }, [open, frame.image, specKey, st.themeId, zoomed, crop?.x, crop?.y, crop?.w, crop?.h])

    if (st.files.length === 0) return <p className="export-body text-muted m-0">Load the match videos first.</p>

    const go = (d: number): void => { setIndex((at + d + picks.length) % picks.length); setFine(0) }
    const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (picks.length < 2 || (e.target as HTMLElement).tagName === 'INPUT') return
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(e.key === 'ArrowRight' ? 1 : -1) }
    }
    const setPan = (p: CropPan): void => { if (cur) setPans((m) => ({ ...m, [cur.id]: p })) }
    const onDragStart = (e: PointerEvent<HTMLCanvasElement>): void => {
        if (!zoomed || e.button > 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { x: e.clientX, y: e.clientY, pan }
        setDragging(true)
    }
    const onDragMove = (e: PointerEvent<HTMLCanvasElement>): void => {
        const d = dragRef.current
        const image = paintRef.current.image
        if (!d || !baseCrop || !image) return
        const box = e.currentTarget.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) return
        // The picture follows the pointer: the part of the frame on show spans the canvas, so one canvas pixel is span / width.
        const span = coverSpan(baseCrop, image.naturalWidth, image.naturalHeight)
        const next = clampPan(baseCrop, {
            x: d.pan.x - ((e.clientX - d.x) / box.width) * span.w,
            y: d.pan.y - ((e.clientY - d.y) / box.height) * span.h,
        })
        setPan(next)
        paintNow(panCrop(baseCrop, next))
    }
    const onDragEnd = (e: PointerEvent<HTMLCanvasElement>): void => {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        dragRef.current = null
        setDragging(false)
    }
    const openPreview = (): void => {
        const canvas = canvasRef.current
        if (canvas && ready) setPreview(canvas.toDataURL('image/jpeg', 0.92))
    }
    const nudge = (d: number): void => setFine((f) => Math.max(-THUMB_FINE_MAX_SEC, Math.min(THUMB_FINE_MAX_SEC, Math.round((f + d) * 100) / 100)))
    const fileName = thumbnailFileName({ kind, title: st.matchdayLabel, teams: st.teams })

    const download = async (share: boolean): Promise<void> => {
        const canvas = canvasRef.current
        if (!canvas || !ready) return
        setBusy(true)
        setNote('')
        try {
            const blob = await jpegUnderLimit(canvas)
            if (!blob) throw new Error('could not make the picture')
            if (share) {
                const f = new File([blob], fileName, { type: 'image/jpeg' })
                await navigator.share({ files: [f], title: fileName })
            } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = fileName
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 10_000)
            }
        } catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError')) setNote(`Could not save the thumbnail: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setBusy(false)
        }
    }
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [new File([''], 'a.jpg', { type: 'image/jpeg' })] })

    if (!open) {
        return (
            <div className="flex flex-col items-start gap-1.5">
                <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>Make a thumbnail</button>
            </div>
        )
    }

    return (
        <div className="thumb-maker flex flex-col gap-2" onKeyDown={onKey}>
            <div className="thumb-maker__pick" role="group" aria-label="Choose the frame">
                <button type="button" className="btn-quiet" aria-label="Previous moment" disabled={picks.length < 2} onClick={() => go(-1)}>‹</button>
                <span className="thumb-maker__label" aria-live="polite">{cur?.label ?? ''}</span>
                <button type="button" className="btn-quiet" aria-label="Next moment" disabled={picks.length < 2} onClick={() => go(1)}>›</button>
            </div>
            <div className="thumb-maker__stage">
                <canvas ref={canvasRef} width={THUMB_W} height={THUMB_H} role="img"
                    className={`thumb-maker__canvas${zoomed ? ' thumb-maker__canvas--zoomed' : ''}${dragging ? ' thumb-maker__canvas--dragging' : ''}`}
                    aria-label={`${kind === 'fullMatch' ? 'Full match' : 'Highlights'} thumbnail preview`}
                    onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} />
                <button type="button" className="thumb-maker__magnify" aria-label="Preview larger" disabled={!ready} onClick={openPreview}>
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                        <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                        <path d="M15 15l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
            {preview && <ThumbnailPreview src={preview} onClose={() => setPreview(null)} />}
            {frame.status === 'error' && <p role="alert" className="export-note">This browser cannot show that frame. Try the other file or a different moment.</p>}
            {frame.status === 'loading' && <p className="export-hint" role="status">Grabbing the frame…</p>}
            <div className="thumb-maker__tune" role="group" aria-label="Fine-tune the frame">
                <button type="button" className="btn-quiet" aria-label="Earlier by a quarter second" disabled={fine <= -THUMB_FINE_MAX_SEC} onClick={() => nudge(-THUMB_FINE_STEP_SEC)}>−0.25 s</button>
                <span className="tc export-body" aria-live="polite">{fine === 0 ? 'at the shot' : `${fine > 0 ? '+' : '−'}${Math.abs(fine).toFixed(2)} s`}</span>
                <button type="button" className="btn-quiet" aria-label="Later by a quarter second" disabled={fine >= THUMB_FINE_MAX_SEC} onClick={() => nudge(THUMB_FINE_STEP_SEC)}>+0.25 s</button>
            </div>
            <label className="toggle-row">
                <input type="checkbox" checked={zoomed} disabled={baseCrop === null} onChange={(e) => setZoom(e.target.checked)} />
                <span className="toggle-row__text">Zoom to the goal<span className="toggle-row__hint">{baseCrop === null ? 'Draw the goal areas in Match setup to use this' : 'Crops to the replay framing. Drag the picture to adjust.'}</span></span>
            </label>
            {zoomed && (pan.x !== 0 || pan.y !== 0) && <button type="button" className="btn-quiet self-start" onClick={() => setPan(NO_PAN)}>Reset position</button>}
            <label className="toggle-row">
                <input type="checkbox" checked={customOn} onChange={(e) => {
                    setCustomOn(e.target.checked)
                    if (e.target.checked && !customText) setCustomText(defaultLine)
                }} />
                <span className="toggle-row__text">Custom text<span className="toggle-row__hint">Replaces the team names on the thumbnail</span></span>
            </label>
            <input type="text" className="field" aria-label="Thumbnail text" maxLength={CUSTOM_MAX_CHARS}
                disabled={!customOn} readOnly={!customOn}
                value={customOn ? customText : defaultLine} onChange={(e) => setCustomText(e.target.value)} />
            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-quiet" disabled={!ready || busy} onClick={() => void download(false)}>Download thumbnail</button>
                {canShare && <button type="button" className="btn-quiet" disabled={!ready || busy} onClick={() => void download(true)}>Share</button>}
            </div>
            <p className="export-hint">1280×720 JPEG, ready for YouTube. Never shows the score.</p>
            {note && <p role="alert" className="export-hint msg-warn">{note}</p>}
        </div>
    )
}
