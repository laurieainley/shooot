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
    | 'kick_off' | 'half_time' | 'final_whistle'   // match markers: never scored, never highlights

export type MarkerType = Extract<EventType, 'kick_off' | 'half_time' | 'final_whistle'>

/** A rectangle of the video frame as fractions (0-1). Crops have the frame's aspect, so h === w. */
export type CropRect = { x: number; y: number; w: number; h: number }

/** Where each team's goal is in the picture: the goal that team defends at kick-off (before any Half time marker). */
export type GoalAreas = { team1?: CropRect; team2?: CropRect }

export type GoalTeam = 'team1' | 'team2'

/** How an event's replay is framed: a goal area, the whole frame or a custom box (undefined = automatic). */
export type ReplayCrop = CropRect | GoalTeam | 'full'

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
    replay?: boolean         // explicit replay override; undefined = default for the type
    replayCrop?: ReplayCrop  // replay framing; undefined = automatic, by event type (utils/attack.ts)
    /** Migrated kick-off: time on the whole timeline, until loaded files cover it (see utils/matchClock.ts). */
    globalTimeSec?: number
}

export type Team = {
    name: string
    color: string
    roster: string[]
    initials?: string        // shown on match graphics; default from the name (graphics/teamStyle.ts)
}

// Keep backward-compat alias for migration
export type Goal = MatchEvent
