import { useAppState } from '../state'
import { migrateEvent } from '../utils/eventTypes'
import { normaliseAreas } from '../utils/crop'
import { cancelDetection } from '../detectJobs'
import { withMigratedKickOff } from '../utils/matchClock'

export type ProjectFileData = Record<string, unknown>

/** Parses a project .json (current or older shape); null when it is not JSON or not an object. */
export async function readProjectFile(file: File): Promise<ProjectFileData | null> {
    try {
        const data: unknown = JSON.parse(await file.text())
        return data && typeof data === 'object' && !Array.isArray(data) ? (data as ProjectFileData) : null
    } catch {
        return null
    }
}

/** How many events the project holds (older files call them goals). */
export function projectEventCount(data: ProjectFileData): number {
    const list = Array.isArray(data.events) ? data.events : Array.isArray(data.goals) ? data.goals : []
    return list.length
}

/** Replaces the events, teams, goal areas and graphics theme with the project's; migrates older files. */
export function applyProjectData(data: ProjectFileData): number {
    const st = useAppState.getState()
    const imported = Array.isArray(data.events) ? data.events : Array.isArray(data.goals) ? data.goals : null
    const left = typeof data.whitesAttackLeft === 'boolean' ? data.whitesAttackLeft : true
    const start = typeof data.matchStartTimeSec === 'number' ? data.matchStartTimeSec : 0
    const teams = Array.isArray(data.teams) && data.teams.length === 2 ? (data.teams as typeof st.teams) : null
    // Older projects kept kick-off as a start time: it becomes a Kick off event.
    if (imported) st.setEvents(withMigratedKickOff(imported.map((e: unknown) => migrateEvent(e as Parameters<typeof migrateEvent>[0], left, teams ?? st.teams)), start))
    else if (start > 0) st.setEvents(withMigratedKickOff(st.events, start))
    cancelDetection()
    st.clearSuggestions() // suggestions belong to the old project
    if (teams) st.setTeams(teams)
    if (typeof data.graphicsTheme === 'string') st.setGraphics({ theme: data.graphicsTheme as never })
    if ('goalAreas' in data) st.setGoalAreas(normaliseAreas(data.goalAreas, left))
    return imported ? imported.length : 0
}
