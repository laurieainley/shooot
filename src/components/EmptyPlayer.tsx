import { useState } from 'react'
import { addPickedFiles } from './addFiles'
import { AddFilesButton } from './FilePills'
import { OpeningStatus } from './OpeningStatus'

const HINTS: [string, string][] = [
    ['G', 'mark an event'], ['⇧← ⇧→', '1 s back / on'], ['↑ ↓', 'frame step'], [', .', 'speed down / up'],
    ['/', 'normal speed'], ['[ ]', 'previous / next file'], ['Home', 'kick-off'], ['Z', 'zoom'], ['L', 'event log'],
]

/** The player cell before any file is loaded: a drop zone with the shortcuts. */
export function EmptyPlayer() {
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)

    return (
        <div
            onDrop={async (e) => {
                e.preventDefault()
                setDragging(false)
                setError(await addPickedFiles(Array.from(e.dataTransfer.files ?? [])))
            }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
            className={`empty-player${dragging ? ' empty-player--over' : ''}`}
        >
            <div className="empty-player__inner">
                <p className="empty-player__title">{dragging ? 'Drop to load' : 'Load the match'}</p>
                <p className="m-0 text-[13px] text-muted">Drop GoPro MP4s (or their .LRV previews) here, in any order.</p>
                <AddFilesButton label="Choose files" className="btn-primary" onError={setError} />
                <OpeningStatus />
                {error && <p className="m-0 text-[12px] text-danger">{error}</p>}
                <dl className="empty-player__keys">
                    {HINTS.map(([k, v]) => (
                        <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>
                    ))}
                </dl>
            </div>
        </div>
    )
}
