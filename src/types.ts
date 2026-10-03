export type VideoSourceFile = {
    id: string
    file: File
    url: string
    name: string
    durationSec?: number
    width?: number
    height?: number
}

export type TimelineFile = VideoSourceFile & {
    cumulativeOffsetSec: number
}

export type EventType =
    | 'goal' | 'own_goal'
    | 'penalty_awarded' | 'penalty_missed'
    | 'highlight' | 'foul' | 'save'

export type MatchEvent = {
    id: string
    matchTimeSec: number
    sourceFileIndex?: number
    sourceFileKey?: string   // durable link to the source file (see utils/fileKey.ts)
    unlinked?: boolean       // true when the source file is not currently loaded
    type: EventType
    pen?: boolean            // goal scored from a penalty
    team?: string            // scoring events: the team credited with the goal
    scorer?: string          // own goal: player from the other team
    notes?: string
}

export type Team = {
    name: string
    color: string
    roster: string[]
}

// Keep backward-compat alias for migration
export type Goal = MatchEvent
