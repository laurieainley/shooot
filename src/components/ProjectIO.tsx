import { useRef, useState, type ChangeEvent } from 'react'
import { useAppState } from '../state'
import { migrateEvent } from '../utils/eventTypes'

/** Export / import the project (events, teams, match start) as JSON. */
export function ProjectIO() {
    const events = useAppState((s) => s.events)
    const importRef = useRef<HTMLInputElement | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const onExport = (): void => {
        const { teams, matchStartTimeSec } = useAppState.getState()
        const blob = new Blob([JSON.stringify({ events, goals: events, teams, matchStartTimeSec }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'project.json'
        a.click()
        URL.revokeObjectURL(url)
    }

    const onImport = async (evt: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = evt.target.files?.[0]
        evt.target.value = ''
        if (!file) return
        try {
            const data = JSON.parse(await file.text())
            const st = useAppState.getState()
            const imported = Array.isArray(data.events) ? data.events : Array.isArray(data.goals) ? data.goals : null
            if (imported) st.setEvents(imported.map((e: unknown) => migrateEvent(e as Parameters<typeof migrateEvent>[0])))
            if (Array.isArray(data.teams) && data.teams.length === 2) st.setTeams(data.teams)
            if (typeof data.matchStartTimeSec === 'number') st.setMatchStartTime(data.matchStartTimeSec)
            setMessage(imported ? `Imported ${imported.length} events` : 'Imported')
        } catch {
            setMessage('Could not read that file as a project (JSON).')
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onExport} disabled={events.length === 0} className="btn-quiet">Export project</button>
            <button type="button" onClick={() => importRef.current?.click()} className="btn-quiet">Import project</button>
            <input ref={importRef} type="file" accept=".json,application/json" onChange={onImport} className="hidden" />
            {message && <span className="text-[12px] text-muted">{message}</span>}
        </div>
    )
}
