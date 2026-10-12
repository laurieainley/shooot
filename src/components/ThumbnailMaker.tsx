import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppState } from '../state'
import { ensureGraphicsFonts, loadLogo } from '../graphics/assets'
import { loadCustomLogo } from '../graphics/logoStore'
import { getTheme } from '../graphics/themes'
import { canvasMeasure, drawCover, paintThumbnailOps } from '../graphics/thumbnail/paint'
import { thumbnailLayoutFor } from '../graphics/thumbnail/registry'
import { THUMB_H, THUMB_W, type ThumbSpec } from '../graphics/thumbnail/types'
import { replayCropResolver } from '../utils/attack'
import { THUMB_FINE_MAX_SEC, THUMB_FINE_STEP_SEC, pickTime, thumbnailFileName, thumbnailPicks } from '../utils/thumbnailPicks'
import { useThumbFrame } from './thumbnailFrame'

interface ThumbnailMakerProps {
    kind: 'highlights' | 'fullMatch'
}

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
 * Export, YouTube thumbnail: a frame of a goal (the ball just before it crosses the line) with the video kind in the
 * corner and the teams' names (never the score), drawn in the chosen graphics style. Flip between goals, nudge the
 * frame, download a 1280×720 JPEG.
 */
export function ThumbnailMaker({ kind }: ThumbnailMakerProps) {
    const st = useAppState(useShallow((s) => ({
        files: s.files, events: s.events, cumulativeOffsets: s.cumulativeOffsets, teams: s.teams, matchdayLabel: s.matchdayLabel,
        themeId: s.graphics.theme, areas: s.goalAreas,
    })))
    const [open, setOpen] = useState(false)
    const [index, setIndex] = useState(0)
    const [fine, setFine] = useState(0)
    const [zoom, setZoom] = useState(false)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState('')
    const [ready, setReady] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const logoRef = useRef<{ done: boolean; bitmap: ImageBitmap | null }>({ done: false, bitmap: null })

    const picks = useMemo(() => thumbnailPicks(st.events, st.cumulativeOffsets, st.files), [st.events, st.cumulativeOffsets, st.files])
    const cur = picks[Math.min(index, Math.max(0, picks.length - 1))] ?? null
    const file = cur ? st.files[cur.fileIndex] : undefined
    const atSec = cur && file ? (cur.event ? pickTime(cur.event.matchTimeSec, file.durationSec, fine) : pickTime(cur.timeSec + 0.25, file.durationSec, fine)) : null
    const crop = useMemo(
        () => (cur?.event ? replayCropResolver({ events: st.events, teams: st.teams, cumulativeOffsets: st.cumulativeOffsets, areas: st.areas })(cur.event) : null),
        [cur, st.events, st.teams, st.cumulativeOffsets, st.areas],
    )
    const zoomed = zoom && crop !== null

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

    const spec: ThumbSpec = {
        kind, team1: st.teams[0]?.name ?? '', team2: st.teams[1]?.name ?? '', title: st.matchdayLabel?.trim() || null, hasLogo: true,
    }
    const specKey = JSON.stringify(spec)

    useEffect(() => {
        const canvas = canvasRef.current
        const image = frame.image
        if (!open || !canvas || !image) return
        let live = true
        void (async () => {
            const theme = getTheme(st.themeId)
            await ensureGraphicsFonts(theme)
            if (!logoRef.current.done) {
                logoRef.current = { done: true, bitmap: await loadLogo(await loadCustomLogo()) }
            }
            if (!live) return
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            ctx.clearRect(0, 0, THUMB_W, THUMB_H)
            drawCover(ctx, image, image.naturalWidth, image.naturalHeight, zoomed ? crop : null)
            const logo = logoRef.current.bitmap
            const ops = thumbnailLayoutFor(theme.id)({ ...spec, hasLogo: !!logo }, canvasMeasure(ctx))
            paintThumbnailOps(ctx, ops, logo)
            setReady(true)
        })()
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, frame.image, specKey, st.themeId, zoomed, crop])

    if (st.files.length === 0) return <p className="m-0 text-[13px] text-muted">Load the match videos first.</p>

    const go = (d: number): void => { setIndex((i) => (i + d + picks.length) % picks.length); setFine(0) }
    const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (picks.length < 2 || (e.target as HTMLElement).tagName === 'INPUT') return
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(e.key === 'ArrowRight' ? 1 : -1) }
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
                <button type="button" className="btn-quiet" aria-label="Previous goal" disabled={picks.length < 2} onClick={() => go(-1)}>‹</button>
                <span className="thumb-maker__label" aria-live="polite">{cur?.label ?? ''}</span>
                <button type="button" className="btn-quiet" aria-label="Next goal" disabled={picks.length < 2} onClick={() => go(1)}>›</button>
            </div>
            <canvas ref={canvasRef} width={THUMB_W} height={THUMB_H} className="thumb-maker__canvas" role="img"
                aria-label={`${kind === 'fullMatch' ? 'Full match' : 'Highlights'} thumbnail preview`} />
            {frame.status === 'error' && <p role="alert" className="export-note">This browser cannot show that frame. Try the other file or a different moment.</p>}
            {frame.status === 'loading' && <p className="m-0 text-[12px] text-muted" role="status">Grabbing the frame…</p>}
            <div className="thumb-maker__tune" role="group" aria-label="Fine-tune the frame">
                <button type="button" className="btn-quiet" aria-label="Earlier by a quarter second" disabled={fine <= -THUMB_FINE_MAX_SEC} onClick={() => nudge(-THUMB_FINE_STEP_SEC)}>−0.25 s</button>
                <span className="tc text-[13px]" aria-live="polite">{fine === 0 ? 'at the shot' : `${fine > 0 ? '+' : '−'}${Math.abs(fine).toFixed(2)} s`}</span>
                <button type="button" className="btn-quiet" aria-label="Later by a quarter second" disabled={fine >= THUMB_FINE_MAX_SEC} onClick={() => nudge(THUMB_FINE_STEP_SEC)}>+0.25 s</button>
            </div>
            <label className="toggle-row">
                <input type="checkbox" checked={zoomed} disabled={crop === null} onChange={(e) => setZoom(e.target.checked)} />
                <span className="toggle-row__text">Zoom to the goal<span className="toggle-row__hint">{crop === null ? 'Draw the goal areas in Match setup to use this' : 'Crops to the replay framing'}</span></span>
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={!ready || busy} onClick={() => void download(false)}>Download thumbnail</button>
                {canShare && <button type="button" className="btn-quiet" disabled={!ready || busy} onClick={() => void download(true)}>Share</button>}
            </div>
            <p className="m-0 text-[12px] text-muted">1280×720 JPEG, under 2 MB. Teams only, never the score. The bottom-right corner stays clear for YouTube’s time badge.</p>
            {note && <p role="alert" className="m-0 text-[12px] msg-warn">{note}</p>}
        </div>
    )
}
