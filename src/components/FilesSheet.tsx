import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'
import { acceptAttr } from '../utils/fileAccept'
import { notePicked, openMediaPicker } from './pickerStatus'
import { fileBadges } from '../utils/fileBadges'
import { formatHMS } from '../utils/timeline'
import { filmingOrder, sortByFilmingTime, type FilmingOrder } from '../utils/fileOrder'
import { replacePickedFile } from './addFiles'
import { AddFilesButton } from './AddFilesButton'
import { OpeningStatus } from './OpeningStatus'
import { Sheet } from './Sheet'

interface FilesSheetProps {
    onClose: () => void
}

/** Pointer drag in progress: the card at `from` follows the pointer by `dy`; `to` is the slot it would drop into. */
type Drag = { from: number; to: number; dy: number; pitch: number }

/**
 * Loaded files as numbered slots in timeline order. Drag a card (or its grip on touch; ↑/↓ on the focused grip) into
 * another slot to reorder; tap to play; ⋯ to replace or remove. Checks the order against each file's recording time.
 */
export function FilesSheet({ onClose }: FilesSheetProps) {
    const files = useAppState((s) => s.files)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const [message, setMessage] = useState<string | null>(null)
    const [drag, setDrag] = useState<Drag | null>(null)
    const [refocus, setRefocus] = useState<string | null>(null)
    const listRef = useRef<HTMLOListElement | null>(null)
    const order = filmingOrder(files)
    const firstDay = files.find((f) => f.recordedAtMs !== undefined)?.recordedAtMs
    const sameDay = files.every((f) => f.recordedAtMs === undefined || sameDate(f.recordedAtMs, firstDay!))

    // Keyed rows move in the DOM on reorder, which can drop focus: put it back on the moved file's grip.
    useEffect(() => {
        if (!refocus) return
        listRef.current?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(refocus)}"]`)?.focus()
        setRefocus(null)
    }, [refocus, files])

    const move = (from: number, to: number) => {
        if (to < 0 || to >= files.length || from === to) return
        useAppState.getState().moveFile(from, to)
    }

    return (
        <Sheet label="Files" onClose={onClose} className="sheet--roomy">
            {files.length === 0
                ? <p className="m-0 py-3 text-[13px] text-muted">No videos loaded.</p>
                : (
                    <>
                        {files.length > 1 && <p className="files-intro">If your video is split into multiple files, arrange them in chronological order here.</p>}
                        <OrderStatus order={order} />
                        <ol ref={listRef} className={`file-slots${drag ? ' file-slots--dragging' : ''}`}>
                            {files.map((f, i) => (
                                <FileSlot key={f.id} file={f} index={i} current={i === currentFileIndex}
                                    startSec={offsets[i] ?? 0} sameDay={sameDay}
                                    filmedBefore={order.kind === 'out-of-order' ? order.earlierThan.get(i) : undefined}
                                    offsetY={slotOffset(i, drag)} dragging={drag?.from === i} target={drag !== null && drag.to === i}
                                    listRef={listRef} onDrag={setDrag} onDrop={(d) => { setDrag(null); if (d) move(d.from, d.to) }}
                                    onKeyMove={(to) => { move(i, to); setRefocus(f.id) }}
                                    onPlay={() => { useAppState.getState().setCurrentFileIndex(i); onClose() }} onError={setMessage} />
                            ))}
                        </ol>
                    </>
                )}
            <div className="flex flex-wrap items-center gap-2 pt-3">
                <AddFilesButton label="Add files" className="btn-quiet" onError={setMessage} />
                <OpeningStatus />
            </div>
            {message && <p className="m-0 pt-2 text-[12px] msg-warn">{message}</p>}
        </Sheet>
    )
}

/** How far a card is shifted while another card is dragged over it (or, for the dragged card, the pointer's travel). */
function slotOffset(i: number, drag: Drag | null): number {
    if (!drag) return 0
    if (i === drag.from) return drag.dy
    if (drag.from < i && i <= drag.to) return -drag.pitch
    if (drag.to <= i && i < drag.from) return drag.pitch
    return 0
}

function OrderStatus({ order }: { order: FilmingOrder }) {
    if (order.kind === 'single') return null
    if (order.kind === 'in-order') return <p className="files-status">✓ In filming order</p>
    if (order.kind === 'unknown') {
        return <p className="files-status">Some files don&apos;t say when they were filmed, so check the thumbnails.</p>
    }
    return (
        <div className="files-status files-status--warn">
            <span className="msg-warn">Not in filming order</span>
            <button type="button" className="btn-quiet" onClick={() => sortFiles()}>Sort by filming time</button>
        </div>
    )
}

function sortFiles() {
    const st = useAppState.getState()
    const playing = st.files[st.currentFileIndex]
    const sorted = sortByFilmingTime(st.files)
    st.setFiles(sorted)
    st.setCurrentFileIndex(Math.max(0, sorted.indexOf(playing)))
}

const sameDate = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

/** Time of day as 7:01pm, so it never reads like a duration; with the day when the files span several. */
function clockLabel(ms: number, withDay: boolean): string {
    const d = new Date(ms)
    const h = d.getHours()
    const time = `${h % 12 || 12}:${`${d.getMinutes()}`.padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
    return withDay ? `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}` : time
}

interface FileSlotProps {
    file: VideoSourceFile
    index: number
    current: boolean
    /** Where this file starts on the match timeline. */
    startSec: number
    sameDay: boolean
    /** Index of a file above this one that was filmed later, when the order looks wrong. */
    filmedBefore?: number
    offsetY: number
    dragging: boolean
    /** This slot is where the dragged card would land: its dotted outline is emphasised. */
    target: boolean
    listRef: RefObject<HTMLOListElement | null>
    onDrag: (d: Drag) => void
    onDrop: (d: Drag | null) => void
    onKeyMove: (to: number) => void
    onPlay: () => void
    onError: (message: string | null) => void
}

type Press = { x: number; y: number; id: number; centres: number[]; pitch: number; active: boolean; last: Drag | null }

function FileSlot({ file: f, index: i, current, startSec, sameDay, filmedBefore, offsetY, dragging, target, listRef, onDrag, onDrop, onKeyMove, onPlay, onError }: FileSlotProps) {
    const replaceRef = useRef<HTMLInputElement | null>(null)
    const busy = useAppState((s) => s.opening !== null)
    const [menu, setMenu] = useState(false)
    const press = useRef<Press | null>(null)
    const dragged = useRef(false)

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        const el = e.target as Element
        if (e.button !== 0 || el.closest('[data-no-drag]')) return
        // Touch drags start from the grip only, so the sheet still scrolls under a finger.
        if (e.pointerType !== 'mouse' && !el.closest('[data-grip]')) return
        const rects = (Array.from(listRef.current?.children ?? []) as HTMLElement[]).map((s) => s.getBoundingClientRect())
        const pitch = rects.length > 1 ? rects[1].top - rects[0].top : 0
        press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, centres: rects.map((r) => r.top + r.height / 2), pitch, active: false, last: null }
    }
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const p = press.current
        if (!p || p.id !== e.pointerId) return
        const dy = e.clientY - p.y
        if (!p.active) {
            if (Math.abs(dy) < 6 && Math.abs(e.clientX - p.x) < 6) return
            p.active = true
            e.currentTarget.setPointerCapture(e.pointerId)
        }
        const centre = p.centres[i] + dy
        let to = 0
        p.centres.forEach((c, k) => { if (Math.abs(c - centre) < Math.abs(p.centres[to] - centre)) to = k })
        p.last = { from: i, to, dy, pitch: p.pitch }
        onDrag(p.last)
    }
    const onPointerEnd = () => {
        const p = press.current
        press.current = null
        if (!p?.active) return
        dragged.current = true // swallow the click that follows the drop
        setTimeout(() => { dragged.current = false }, 0)
        onDrop(p.last)
    }

    return (
        <li aria-label={f.name} aria-current={current ? 'true' : undefined} className={`file-slot${target ? ' file-slot--target' : ''}`}>
            <span className="file-slot__num tc" aria-hidden="true">{i + 1}</span>
            <div className={`file-card${dragging ? ' file-card--dragging' : ''}`} style={offsetY ? { transform: `translateY(${offsetY}px)` } : undefined}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
                <button type="button" data-grip={f.id} aria-label={`Reorder ${f.name}`} title="Drag to reorder (or ↑/↓)" className="file-card__grip"
                    onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                        e.preventDefault()
                        e.stopPropagation()
                        onKeyMove(i + (e.key === 'ArrowUp' ? -1 : 1))
                    }}>
                    <GripIcon />
                </button>
                <button type="button" aria-label={`Play ${f.name}`} className="file-card__main" onClick={() => { if (!dragged.current) onPlay() }}>
                    <Thumb file={f} />
                    <span className="file-card__text">
                        <span className="file-card__name">{f.name}</span>
                        <span className="file-card__meta tc">
                            <span>Starts {formatHMS(startSec)}</span>
                            {f.durationSec != null && <span>Duration {formatHMS(f.durationSec)}</span>}
                            {f.recordedAtMs !== undefined && <span>Filmed {clockLabel(f.recordedAtMs, !sameDay)}</span>}
                        </span>
                        {(filmedBefore !== undefined || fileBadges(f).length > 0) && (
                            <span className="file-card__tags">
                                {filmedBefore !== undefined && <span className="tag tag-warn">filmed before {filmedBefore + 1}</span>}
                                {fileBadges(f).map((b) => <span key={b} className={`tag ${b === "can't play here" ? 'tag-warn' : ''}`}>{b}</span>)}
                            </span>
                        )}
                    </span>
                </button>
                <button type="button" data-no-drag aria-label={`More for ${f.name}`} aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="row-btn file-card__more">
                    <DotsIcon />
                </button>
            </div>
            {menu && (
                <div className="file-slot__actions">
                    <button type="button" onClick={() => replaceRef.current && openMediaPicker(replaceRef.current)} disabled={busy} className="btn-quiet">Replace file…</button>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => useAppState.getState().removeFile(i)} className="btn-quiet btn-danger">Remove</button>
                </div>
            )}
            <input ref={replaceRef} type="file" accept={acceptAttr()} aria-label={`Replace ${f.name} with`} className="hidden"
                onChange={async (evt) => {
                    const picked = Array.from(evt.target.files ?? [])
                    notePicked(picked)
                    evt.target.value = ''
                    setMenu(false)
                    onError(await replacePickedFile(i, picked))
                }} />
        </li>
    )
}

/** Frame from the start of the file, from a muted, paused video element (the browser reads only the start). */
function Thumb({ file: f }: { file: VideoSourceFile }) {
    const [failed, setFailed] = useState(false)
    if (f.playbackIssue || failed || !f.url) return <span className="file-card__thumb" aria-hidden="true" />
    return <video className="file-card__thumb" src={`${f.url}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} onError={() => setFailed(true)} />
}

function GripIcon() {
    return (
        <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" focusable="false">
            {[2, 8, 14].flatMap((y) => [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />))}
        </svg>
    )
}

function DotsIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <circle cx="5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="19" cy="12" r="1.8" fill="currentColor" />
        </svg>
    )
}
