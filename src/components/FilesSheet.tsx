import { useRef, useState } from 'react'
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

/**
 * Loaded files in timeline order: tap to play, ↑/↓ to reorder, replace or remove; add more. Explains that the files
 * play back to back as one match and checks the order against each file's recording time.
 */
export function FilesSheet({ onClose }: FilesSheetProps) {
    const files = useAppState((s) => s.files)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const [message, setMessage] = useState<string | null>(null)
    const order = filmingOrder(files)
    const sameDay = files.every((f) => f.recordedAtMs === undefined || new Date(f.recordedAtMs).toDateString() === new Date(files[0].recordedAtMs ?? f.recordedAtMs).toDateString())

    return (
        <Sheet label="Files" onClose={onClose} className="sheet--narrow">
            {files.length === 0
                ? <p className="m-0 py-3 text-[13px] text-muted">No videos loaded.</p>
                : (
                    <>
                        {files.length > 1 && (
                            <p className="files-intro">
                                These play back to back as one match, top to bottom. Keep them in the order you filmed them:
                                the match clock, event times and full-match export all follow it.
                            </p>
                        )}
                        <OrderStatus order={order} />
                        <ol className="file-list">
                            {files.map((f, i) => (
                                <FileRow key={f.id} file={f} index={i} count={files.length} current={i === currentFileIndex}
                                    startSec={offsets[i] ?? 0} sameDay={sameDay}
                                    filmedBefore={order.kind === 'out-of-order' ? order.earlierThan.get(i) : undefined}
                                    onPlay={() => { useAppState.getState().setCurrentFileIndex(i); onClose() }} onError={setMessage} />
                            ))}
                        </ol>
                        {files.length > 1 && <p className="files-note">Moving a file moves its events with it.</p>}
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

function OrderStatus({ order }: { order: FilmingOrder }) {
    if (order.kind === 'single') return null
    if (order.kind === 'in-order') return <p className="files-status">✓ In filming order</p>
    if (order.kind === 'unknown') {
        return (
            <p className="files-status">
                Some files don&apos;t say when they were filmed, so check the order yourself: play the start of each one.
            </p>
        )
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

function filmedLabel(ms: number, sameDay: boolean): string {
    const d = new Date(ms)
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    return sameDay ? time : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`
}

interface FileRowProps {
    file: VideoSourceFile
    index: number
    count: number
    current: boolean
    /** Where this file starts on the match timeline. */
    startSec: number
    sameDay: boolean
    /** Index of a file above this one that was filmed later, when the order looks wrong. */
    filmedBefore?: number
    onPlay: () => void
    onError: (message: string | null) => void
}

function FileRow({ file: f, index: i, count, current, startSec, sameDay, filmedBefore, onPlay, onError }: FileRowProps) {
    const replaceRef = useRef<HTMLInputElement | null>(null)
    const busy = useAppState((s) => s.opening !== null)
    const { moveFile, removeFile } = useAppState.getState()

    return (
        <li aria-label={f.name} aria-current={current ? 'true' : undefined} className="file-row">
            <span className="file-row__index tc" aria-hidden="true">{i + 1}</span>
            <button type="button" aria-label={`Play ${f.name}`} onClick={onPlay} className="file-row__main">
                <span className="file-row__name">{f.name}</span>
                <span className="file-row__meta tc">
                    <span>Starts {formatHMS(startSec)}</span>
                    {f.durationSec != null && <span>{formatHMS(f.durationSec)} long</span>}
                    {f.recordedAtMs !== undefined && <span>filmed {filmedLabel(f.recordedAtMs, sameDay)}</span>}
                </span>
                {(filmedBefore !== undefined || fileBadges(f).length > 0) && (
                    <span className="file-row__tags">
                        {filmedBefore !== undefined && <span className="tag tag-warn">filmed before {filmedBefore + 1}</span>}
                        {fileBadges(f).map((b) => <span key={b} className={`tag ${b === "can't play here" ? 'tag-warn' : ''}`}>{b}</span>)}
                    </span>
                )}
            </button>
            <span className="file-row__tools">
                <button type="button" aria-label={`Move ${f.name} earlier`} onClick={() => moveFile(i, i - 1)} disabled={i === 0} className="row-btn">↑</button>
                <button type="button" aria-label={`Move ${f.name} later`} onClick={() => moveFile(i, i + 1)} disabled={i === count - 1} className="row-btn">↓</button>
                <button type="button" onClick={() => replaceRef.current && openMediaPicker(replaceRef.current)} disabled={busy} className="btn-quiet file-row__replace">Replace…</button>
                <input ref={replaceRef} type="file" accept={acceptAttr()} aria-label={`Replace ${f.name} with`} className="hidden"
                    onChange={async (evt) => {
                        const picked = Array.from(evt.target.files ?? [])
                        notePicked(picked)
                        evt.target.value = ''
                        onError(await replacePickedFile(i, picked))
                    }} />
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(i)} className="row-btn delete-btn">×</button>
            </span>
        </li>
    )
}
