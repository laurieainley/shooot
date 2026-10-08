import { useRef, useState } from 'react'
import { useAppState } from '../state'
import { acceptAttr } from '../utils/fileAccept'
import { notePicked, openMediaPicker } from './pickerStatus'
import { fileBadges } from '../utils/fileBadges'
import { formatHMS } from '../utils/timeline'
import { addPickedFiles } from './addFiles'
import { OpeningStatus } from './OpeningStatus'
import { filePicker, pickWithHandles } from '../files/handleStore'

interface AddFilesButtonProps {
    label?: string
    className?: string
    onError?: (message: string | null) => void
}

export function AddFilesButton({ label = '+ files', className = 'file-add', onError }: AddFilesButtonProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const busy = useAppState((s) => s.opening !== null)
    return (
        <>
            <button type="button" disabled={busy} className={className} onClick={async () => {
                // Desktop Chrome / Edge: the system picker gives handles we keep, so a reload can relink in one click.
                if (filePicker()) {
                    try {
                        const files = await pickWithHandles()
                        if (files) onError?.(await addPickedFiles(files))
                        return
                    } catch { /* fall back to the plain input */ }
                }
                if (inputRef.current) openMediaPicker(inputRef.current)
            }}>{label}</button>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={acceptAttr()}
                onChange={async (evt) => {
                    const picked = Array.from(evt.target.files ?? [])
                    notePicked(picked)
                    evt.target.value = ''
                    onError?.(await addPickedFiles(picked))
                }}
                className="hidden"
            />
        </>
    )
}

/** The loaded files in timeline order: click to play, ↑↓ to reorder, × to remove. */
export function FilePills() {
    const files = useAppState((s) => s.files)
    const moveFile = useAppState((s) => s.moveFile)
    const removeFile = useAppState((s) => s.removeFile)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const setCurrentFileIndex = useAppState((s) => s.setCurrentFileIndex)
    const [message, setMessage] = useState<string | null>(null)

    return (
        <div className="file-pills">
            {files.map((f, i) => (
                <div
                    key={f.id}
                    onClick={() => setCurrentFileIndex(i)}
                    aria-current={i === currentFileIndex ? 'true' : undefined}
                    className="file-pill"
                    title={f.name}
                >
                    <span className="file-pill__num tc">{i + 1} ·</span>
                    <span className="file-pill__name">{f.name}</span>
                    {f.durationSec != null && <span className="file-pill__dur tc">{formatHMS(f.durationSec)}</span>}
                    {fileBadges(f).map((b) => (
                        <span key={b} title={b === "can't play here" ? `${f.playbackIssue} — add a proxy file, or render on a computer` : undefined}
                            className={`tag ${b === "can't play here" ? 'tag-warn' : ''}`}>
                            {b}
                        </span>
                    ))}
                    <span className="file-pill__tools">
                        {files.length > 1 && (
                            <>
                                <button type="button" aria-label={`Move ${f.name} earlier`} onClick={(e) => { e.stopPropagation(); moveFile(i, i - 1) }} disabled={i === 0} className="row-btn">↑</button>
                                <button type="button" aria-label={`Move ${f.name} later`} onClick={(e) => { e.stopPropagation(); moveFile(i, i + 1) }} disabled={i === files.length - 1} className="row-btn">↓</button>
                            </>
                        )}
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={(e) => { e.stopPropagation(); removeFile(i) }} className="row-btn delete-btn">×</button>
                    </span>
                </div>
            ))}
            <AddFilesButton onError={setMessage} />
            <OpeningStatus />
            {message && <span className="text-[12px] text-danger">{message}</span>}
        </div>
    )
}
