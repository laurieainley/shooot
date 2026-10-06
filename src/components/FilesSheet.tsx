import { useRef, useState } from 'react'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'
import { acceptAttr } from '../utils/fileAccept'
import { notePicked, openMediaPicker } from './pickerStatus'
import { fileBadges } from '../utils/fileBadges'
import { formatHMS } from '../utils/timeline'
import { replacePickedFile } from './addFiles'
import { AddFilesButton } from './FilePills'
import { OpeningStatus } from './OpeningStatus'
import { Sheet } from './Sheet'

interface FilesSheetProps {
    onClose: () => void
}

/** Loaded files in timeline order: tap to play, ↑/↓ to reorder, replace or remove; add more. */
export function FilesSheet({ onClose }: FilesSheetProps) {
    const files = useAppState((s) => s.files)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const [message, setMessage] = useState<string | null>(null)

    return (
        <Sheet label="Files" onClose={onClose} className="sheet--narrow">
            {files.length === 0
                ? <p className="m-0 py-3 text-[13px] text-muted">No videos loaded.</p>
                : (
                    <ul className="file-list">
                        {files.map((f, i) => (
                            <FileRow key={f.id} file={f} index={i} count={files.length} current={i === currentFileIndex}
                                onPlay={() => { useAppState.getState().setCurrentFileIndex(i); onClose() }} onError={setMessage} />
                        ))}
                    </ul>
                )}
            <div className="flex flex-wrap items-center gap-2 pt-3">
                <AddFilesButton label="Add files" className="btn-quiet" onError={setMessage} />
                <OpeningStatus />
            </div>
            {message && <p className="m-0 pt-2 text-[12px] text-danger">{message}</p>}
        </Sheet>
    )
}

interface FileRowProps {
    file: VideoSourceFile
    index: number
    count: number
    current: boolean
    onPlay: () => void
    onError: (message: string | null) => void
}

function FileRow({ file: f, index: i, count, current, onPlay, onError }: FileRowProps) {
    const replaceRef = useRef<HTMLInputElement | null>(null)
    const busy = useAppState((s) => s.opening !== null)
    const { moveFile, removeFile } = useAppState.getState()

    return (
        <li aria-label={f.name} aria-current={current ? 'true' : undefined} className="file-row">
            <button type="button" aria-label={`Play ${f.name}`} onClick={onPlay} className="file-row__main">
                <span className="file-row__index tc">V{i + 1}</span>
                <span className="file-row__name">{f.name}</span>
                {f.durationSec != null && <span className="file-pill__dur tc">{formatHMS(f.durationSec)}</span>}
                {fileBadges(f).map((b) => <span key={b} className={`tag ${b === "can't play here" ? 'tag-warn' : ''}`}>{b}</span>)}
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
