import type { Suggestion, SuggestionRun } from '../types'
import type { ClipOptions } from './exportPlans'
import { buildTransferPayload, type TransferPayload } from './projectTransfer'
import { isMarker } from './eventTypes'
import { fileKeys } from './fileKey'
import { finalScore } from './score'

export interface FileMeta { name: string; size: number; durationSec?: number; key: string; recordedAtMs?: number }

/** Everything a saved match holds: the project (as in transfer links) plus review and clip state. Never video. */
export interface MatchData extends TransferPayload {
    suggestions: Suggestion[]
    suggestionRun: SuggestionRun | null
    clipOptions: ClipOptions
}

export interface MatchSummary {
    title: string
    teams: [string, string] | null
    score: [number, number] | null
    dateMs: number
    fileCount: number
    eventCount: number
}

export interface MatchRecord {
    id: string
    createdAt: number
    updatedAt: number
    data: MatchData
    files: FileMeta[]
    summary: MatchSummary
}

export type RecordSource = MatchData & {
    files: { name: string; file?: { size: number }; durationSec?: number; recordedAtMs?: number }[]
}

export function newMatchId(now: number, rand: () => number): string {
    return `m-${now}-${rand().toString(36).slice(2, 6).padEnd(4, '0')}`
}

/** A match is worth keeping once it has a video or an event. */
export function isWorthSaving(s: { files: unknown[]; events: unknown[] }): boolean {
    return s.files.length > 0 || s.events.length > 0
}

export function fileMetas(files: RecordSource['files']): FileMeta[] {
    const keys = fileKeys(files)
    return files.map((f, i) => ({
        name: f.name, size: f.file?.size ?? 0, key: keys[i],
        ...(f.durationSec !== undefined ? { durationSec: f.durationSec } : {}),
        ...(f.recordedAtMs !== undefined ? { recordedAtMs: f.recordedAtMs } : {}),
    }))
}

export function recordTitle(data: Pick<MatchData, 'matchdayLabel' | 'teams'>): string {
    const label = data.matchdayLabel?.trim()
    if (label) return label
    const [a, b] = data.teams ?? []
    if (a?.name?.trim() && b?.name?.trim()) return `${a.name.trim()} v ${b.name.trim()}`
    return 'Untitled match'
}

export function matchDate(files: FileMeta[], createdAt: number): number {
    const times = files.map((f) => f.recordedAtMs).filter((t): t is number => typeof t === 'number')
    return times.length > 0 ? Math.min(...times) : createdAt
}

export function summarise(data: MatchData, files: FileMeta[], createdAt: number): MatchSummary {
    const hasTeams = Array.isArray(data.teams) && data.teams.length >= 2
    const [s1, s2] = hasTeams ? finalScore(data.events, data.teams) : [0, 0]
    return {
        title: recordTitle(data),
        teams: hasTeams ? [data.teams[0].name, data.teams[1].name] : null,
        score: hasTeams ? [s1, s2] : null,
        dateMs: matchDate(files, createdAt),
        fileCount: files.length,
        eventCount: data.events.filter((e) => !isMarker(e)).length,
    }
}

export function buildRecord(src: RecordSource, id: string, now: number, prev?: MatchRecord | null): MatchRecord {
    const data: MatchData = {
        ...buildTransferPayload(src), suggestions: src.suggestions, suggestionRun: src.suggestionRun, clipOptions: src.clipOptions,
    }
    const createdAt = prev?.createdAt ?? now
    const files = src.files.length === 0 && prev ? prev.files : fileMetas(src.files)
    return { id, createdAt, updatedAt: now, data, files, summary: summarise(data, files, createdAt) }
}

export function sameRecordData(a: MatchRecord, b: MatchRecord): boolean {
    return JSON.stringify([a.data, a.files]) === JSON.stringify([b.data, b.files])
}
