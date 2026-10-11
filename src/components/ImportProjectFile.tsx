import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppState } from '../state'
import { applyProjectData, projectEventCount, readProjectFile, type ProjectFileData } from './importProject'

interface ImportProjectFileProps {
    /** Choose file is the dialog's lime button while this side is the active one. */
    primary: boolean
    onDone: () => void
}

/** Left half of the Import dialog: pick or drop a project .json (⋯ → Export project); asks before replacing tagged events. */
export function ImportProjectFile({ primary, onDone }: ImportProjectFileProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const [pending, setPending] = useState<{ data: ProjectFileData; count: number } | null>(null)

    const take = async (file: File | undefined): Promise<void> => {
        if (!file) return
        const data = await readProjectFile(file)
        if (!data) { setMessage('Could not read that file as a project (JSON).'); return }
        const count = projectEventCount(data)
        const existing = useAppState.getState().events.length
        if (existing > 0 && count > 0) { setMessage(null); setPending({ data, count }); return }
        applyProjectData(data)
        onDone()
    }

    const onChange = (evt: ChangeEvent<HTMLInputElement>): void => {
        const file = evt.target.files?.[0]
        evt.target.value = ''
        void take(file)
    }
    const onDrop = (evt: DragEvent<HTMLDivElement>): void => {
        evt.preventDefault()
        setDragging(false)
        void take(evt.dataTransfer.files?.[0])
    }

    const existing = useAppState.getState().events.length
    return (
        <section aria-labelledby="import-file-title" className="import-part">
            <h3 id="import-file-title" className="import-part__title">Import a project file</h3>
            <p className="import-part__hint">The .json from ⋯ → Export project: events, teams, goal areas and graphics theme. Videos are not included, so add them in Files.</p>
            {pending ? (
                <div role="alertdialog" aria-label="Replace events" className="import-part__confirm">
                    <p className="m-0">Replace your {existing} {existing === 1 ? 'event' : 'events'} with the {pending.count} in this file? Undo (⌘Z) brings them back.</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-primary" onClick={() => { applyProjectData(pending.data); setPending(null); onDone() }}>Replace events</button>
                        <button type="button" className="btn-quiet" onClick={() => setPending(null)}>Keep mine</button>
                    </div>
                </div>
            ) : (
                <div className={`import-drop${dragging ? ' import-drop--over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
                    <p className="import-drop__text">Drop a project file here</p>
                    <button type="button" className={primary ? 'btn-primary' : 'btn-quiet'} onClick={() => inputRef.current?.click()}>Choose file</button>
                    <input ref={inputRef} type="file" accept=".json,application/json" aria-label="Project file" onChange={onChange} className="hidden" />
                </div>
            )}
            {message && <p role="status" className="import-part__note">{message}</p>}
        </section>
    )
}
