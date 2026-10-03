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

export type EventType = 'goal' | 'save' | 'foul' | 'card' | 'moment'

export type MatchEvent = {
    id: string
    matchTimeSec: number
    sourceFileIndex?: number
    type: EventType
    team?: string
    scorer?: string
    notes?: string
}

// Keep backward-compat alias for migration
export type Goal = MatchEvent
