import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useAppState } from '../state'
import { filePicker, loadHandles, reopenHandles, type StoredHandle } from '../files/handleStore'
import { FILE_INPUT_ACCEPT } from '../utils/fileAccept'
import { addPickedFiles } from './addFiles'

/**
 * After a reload the videos are gone but the events are not. Desktop Chrome / Edge: the remembered file handles reopen
 * them in one click (one permission prompt). Elsewhere: the normal picker, and events find their files by name.
 */
export function RelinkBanner() {
    const files = useAppState((s) => s.files)
    const events = useAppState((s) => s.events)
    const [handles, setHandles] = useState<StoredHandle[]>([])
    const [message, setMessage] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)

    const waiting = files.length === 0 ? events : events.filter((e) => e.unlinked)
    const missingKeys = [...new Set(waiting.map((e) => e.sourceFileKey).filter((k): k is string => !!k))]
    useEffect(() => {
        if (waiting.length === 0) return
        let live = true
        void loadHandles().then((h) => { if (live) setHandles(h) })
        return () => { live = false }
    }, [waiting.length])

    if (waiting.length === 0) return null
    const oneClick = !!filePicker() && handles.length > 0

    const relink = async (): Promise<void> => {
        if (oneClick) {
            const { files: reopened, failed } = await reopenHandles(handles)
            if (reopened.length > 0) {
                const err = await addPickedFiles(reopened)
                setMessage(err ?? (failed.length ? `Could not open: ${failed.join(', ')}` : null))
                if (failed.length === 0) return
            }
        }
        setMessage('Pick the same videos: events find their files by name.')
        inputRef.current?.click()
    }
    const onPick = async (evt: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const picked = Array.from(evt.target.files ?? [])
        evt.target.value = ''
        if (picked.length > 0) setMessage(await addPickedFiles(picked))
    }

    const n = waiting.length
    return (
        <div className="relink-banner" role="region" aria-label="Relink files">
            <p className="m-0">
                <b>{n} {n === 1 ? 'event needs its video' : 'events need their videos'}</b>
                {missingKeys.length > 0 && files.length > 0 && <span className="text-muted"> · {missingKeys.join(', ')}</span>}
                <span className="block text-muted">{oneClick ? 'Reopen the match’s files in one click.' : 'Browsers forget picked files on reload.'}</span>
            </p>
            <button type="button" className="btn-primary" onClick={() => void relink()}>Relink files</button>
            <input ref={inputRef} type="file" multiple accept={FILE_INPUT_ACCEPT} aria-label="Videos to relink" className="hidden" onChange={(e) => void onPick(e)} />
            {message && <p role="status" className="relink-banner__msg">{message}</p>}
        </div>
    )
}
