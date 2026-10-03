export type VideoSourceFile = {
    id: string
    file: File            // played in the editor (proxy if one is available and playable)
    url: string
    name: string
    durationSec?: number
    width?: number
    height?: number
    kind: 'full' | 'proxy'
    codec?: 'h264' | 'hevc'
    fullFile?: File       // full-quality file used for render when `file` is a proxy
    playbackIssue?: string // set when this browser cannot play `file`
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
