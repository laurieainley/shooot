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

export type EventType = 'goal' | 'save' | 'foul' | 'card' | 'moment'

export type MatchEvent = {
    id: string
    matchTimeSec: number
    sourceFileIndex?: number
    sourceFileKey?: string   // durable link to the source file (see utils/fileKey.ts)
    unlinked?: boolean       // true when the source file is not currently loaded
    type: EventType
    team?: string
    scorer?: string
    notes?: string
}

// Keep backward-compat alias for migration
export type Goal = MatchEvent
