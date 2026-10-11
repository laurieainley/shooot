import { selectMatchStartSec, useAppState } from '../state'

/** The ⋯ menu's "Export project": events, teams, goal areas and graphics theme as project.json (import lives in the Import… dialog). */
export function ProjectIO() {
    const events = useAppState((s) => s.events)

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

    return <button type="button" role="menuitem" onClick={onExport} disabled={events.length === 0}>Export project</button>
}
