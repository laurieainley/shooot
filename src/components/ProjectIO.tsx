import { useRef, useState, type ChangeEvent } from 'react'
import { selectMatchStartSec, useAppState } from '../state'
import { migrateEvent } from '../utils/eventTypes'
import { normaliseAreas } from '../utils/crop'
import { withMigratedKickOff } from '../utils/matchClock'

interface ProjectIOProps {
    /** Render the two actions as menu items (inside the ⋯ menu). */
    menu?: boolean
}

/** Export / import the project (events, teams, match start) as JSON. */
export function ProjectIO({ menu = false }: ProjectIOProps) {
    const events = useAppState((s) => s.events)
    const importRef = useRef<HTMLInputElement | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const onExport = (): void => {
        const st = useAppState.getState()
        const { teams, goalAreas } = st
        const matchStartTimeSec = selectMatchStartSec(st) // kept for older versions of the app
        const blob = new Blob([JSON.stringify({ events, goals: events, teams, matchStartTimeSec, goalAreas, graphicsTheme: st.graphics.theme }, null, 2)], { type: 'application/json' })
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
            const left = typeof data.whitesAttackLeft === 'boolean' ? data.whitesAttackLeft : true
            const start = typeof data.matchStartTimeSec === 'number' ? data.matchStartTimeSec : 0
            // Older projects kept kick-off as a start time: it becomes a Kick off event.
            if (imported) st.setEvents(withMigratedKickOff(imported.map((e: unknown) => migrateEvent(e as Parameters<typeof migrateEvent>[0], left, Array.isArray(data.teams) && data.teams.length === 2 ? data.teams : st.teams)), start))
            else if (start > 0) st.setEvents(withMigratedKickOff(st.events, start))
            if (Array.isArray(data.teams) && data.teams.length === 2) st.setTeams(data.teams)
            if (typeof data.graphicsTheme === 'string') st.setGraphics({ theme: data.graphicsTheme as never })
            if ('goalAreas' in data) st.setGoalAreas(normaliseAreas(data.goalAreas, left))
            setMessage(imported ? `Imported ${imported.length} events` : 'Imported')
        } catch {
            setMessage('Could not read that file as a project (JSON).')
        }
    }

    const role = menu ? 'menuitem' : undefined
    const btn = menu ? undefined : 'btn-quiet'
    const actions = (
        <>
            <button type="button" role={role} onClick={onExport} disabled={events.length === 0} className={btn}>Export project</button>
            <button type="button" role={role} onClick={() => importRef.current?.click()} className={btn}>Import project</button>
            <input ref={importRef} type="file" accept=".json,application/json" onChange={onImport} className="hidden" />
            {message && <span role="status" className="px-2.5 py-1 text-[12px] text-muted">{message}</span>}
        </>
    )
    return menu ? actions : <div className="flex flex-wrap items-center gap-2">{actions}</div>
}
