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

export type Goal = {
    id: string
    matchTimeSec: number
    // 0-based index of the source video in the ordered files list
    sourceFileIndex?: number
    team?: string
    scorer?: string
    notes?: string
}


