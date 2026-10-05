import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MatchEvent, Team, VideoSourceFile } from './types'
import { migrateEvent } from './utils/eventTypes'
import { computeCumulativeOffsets } from './utils/timeline'
import { mergeOverlappingGoalSegments, type HighlightSegment } from './utils/highlights'
import { relinkEvents, linkedEvents } from './utils/relink'
import { parseGoProName } from './utils/gopro'

type AppState = {
    files: VideoSourceFile[]
    events: MatchEvent[]
    cumulativeOffsets: number[]
    currentTimeInFileSec: number
    currentFileIndex: number
    matchStartTimeSec: number
    adjustTimestampsByOffset: boolean
    // Highlight length configuration
    lengthBeforeGoalSec: number
    lengthAfterGoalSec: number
    // Slow-mo replay configuration
    replayBeforeSec: number
    replayAfterSec: number
    replaySpeed: number
    // Preview mode state
    isPreviewMode: boolean
    previewSegments: HighlightSegment[]
    currentPreviewSegment: number
    setFiles: (files: VideoSourceFile[]) => void
    addFiles: (files: VideoSourceFile[]) => void
    moveFile: (from: number, to: number) => void
    removeFile: (index: number) => void
    attachFullFiles: (files: File[]) => string[]
    setCurrentTimeInFile: (t: number) => void
    setCurrentFileIndex: (idx: number) => void
    setMatchStartTime: (time: number) => void
    setAdjustTimestampsByOffset: (adjust: boolean) => void
    setLengthBeforeGoal: (seconds: number) => void
    setLengthAfterGoal: (seconds: number) => void
    setReplayWindow: (before: number, after: number) => void
    setReplaySpeed: (speed: number) => void
    seekToGoal: (fileIndex: number, timeSec: number) => void
    nextFile: () => void
    prevFile: () => void
    addEvent: (event: MatchEvent) => void
    addEvents: (events: MatchEvent[]) => void
    setEvents: (events: MatchEvent[]) => void
    removeEvent: (id: string) => void
    updateEvent: (id: string, partial: Partial<MatchEvent>) => void
    sortEvents: () => void
    clear: () => void
    newMatch: () => void
    // Undo/redo
    undoStack: MatchEvent[][]
    redoStack: MatchEvent[][]
    undo: () => void
    redo: () => void
    // Preview mode actions
    startPreview: () => void
    exitPreview: () => void
    nextPreviewSegment: () => void
    prevPreviewSegment: () => void
    // Teams, rosters and the event picker
    teams: Team[]
    picker: { eventId: string } | null
    setTeams: (teams: Team[]) => void
    renameTeam: (index: number, name: string) => void
    addToRoster: (team: string, name: string) => void
    markEvent: (timeInFileSec: number) => void
    openPicker: (eventId: string) => void
    closePicker: () => void
}

export const useAppState = create<AppState>()(
    persist(
        (set, get) => {
            const MAX_UNDO_DEPTH = 50
            return {
            files: [],
            events: [],
            teams: [
                { name: 'Whites', color: '#f5f5f5', roster: [] },
                { name: 'Colours', color: '#c2364a', roster: [] },
            ],
            picker: null,
            cumulativeOffsets: [],
            currentTimeInFileSec: 0,
            currentFileIndex: 0,
            matchStartTimeSec: 0,
            adjustTimestampsByOffset: false,
            // Highlight length configuration
            lengthBeforeGoalSec: 10,
            lengthAfterGoalSec: 4,
            // Slow-mo replay configuration
            replayBeforeSec: 4,
            replayAfterSec: 1,
            replaySpeed: 0.5,
            // Undo/redo stacks
            undoStack: [],
            redoStack: [],
            // Preview mode state
            isPreviewMode: false,
            previewSegments: [],
            currentPreviewSegment: 0,
            setFiles: (files) => set({
                files,
                cumulativeOffsets: computeCumulativeOffsets(files),
                events: relinkEvents(get().events, files),
            }),
            addFiles: (added) => get().setFiles([...get().files, ...added]),
            moveFile: (from, to) => {
                const files = get().files
                if (to < 0 || to >= files.length || from === to) return
                const next = files.slice()
                const [moved] = next.splice(from, 1)
                next.splice(to, 0, moved)
                const cur = get().currentFileIndex
                get().setFiles(next)
                if (cur === from) set({ currentFileIndex: to })
            },
            attachFullFiles: (picked) => {
                const unmatched: string[] = []
                const files = get().files.slice()
                for (const f of picked) {
                    const key = parseGoProName(f.name)?.key
                    const idx = key ? files.findIndex((e) => e.kind === 'proxy' && parseGoProName(e.name)?.key === key) : -1
                    if (idx === -1) unmatched.push(f.name)
                    else files[idx] = { ...files[idx], fullFile: f }
                }
                set({ files })
                return unmatched
            },
            removeFile: (index) => {
                const newFiles = get().files.filter((_, i) => i !== index)
                const newFileIndex = Math.min(get().currentFileIndex, newFiles.length - 1)
                set({
                    files: newFiles,
                    cumulativeOffsets: computeCumulativeOffsets(newFiles),
                    currentFileIndex: Math.max(0, newFileIndex),
                    events: relinkEvents(get().events, newFiles),
                })
            },
            setCurrentTimeInFile: (t) => set({ currentTimeInFileSec: t }),
            setCurrentFileIndex: (idx) => set({ currentFileIndex: Math.max(0, Math.min(idx, get().files.length - 1)) }),
            setMatchStartTime: (time) => set({ matchStartTimeSec: time }),
            setAdjustTimestampsByOffset: (adjust) => set({ adjustTimestampsByOffset: adjust }),
            setLengthBeforeGoal: (seconds) => set({ lengthBeforeGoalSec: Math.max(0, seconds) }),
            setLengthAfterGoal: (seconds) => set({ lengthAfterGoalSec: Math.max(0, seconds) }),
            setReplayWindow: (before, after) => set({
                replayBeforeSec: Math.min(15, Math.max(0, before)),
                replayAfterSec: Math.min(15, Math.max(0, after)),
            }),
            setReplaySpeed: (speed) => set({ replaySpeed: speed <= 0.375 ? 0.25 : 0.5 }),
            seekToGoal: (fileIndex, timeSec) => {
                // This will be handled by the Player component via a custom event
                const event = new CustomEvent('seekToGoal', {
                    detail: { fileIndex, timeSec }
                })
                window.dispatchEvent(event)
            },
            nextFile: () => set({ currentFileIndex: Math.min(get().currentFileIndex + 1, get().files.length - 1) }),
            prevFile: () => set({ currentFileIndex: Math.max(get().currentFileIndex - 1, 0) }),
            addEvent: (event) => get().addEvents([event]),
            addEvents: (added) => {
                if (added.length === 0) return
                const state = get()
                const prevEvents = state.events
                const newEvents = relinkEvents([...prevEvents, ...added], state.files)
                const sortedEvents = newEvents.sort((a, b) => {
                    const aTime = (state.cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec
                    const bTime = (state.cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec
                    return aTime - bTime
                })
                set({
                    events: sortedEvents,
                    undoStack: [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), prevEvents],
                    redoStack: [],
                })
            },
            setEvents: (events) => {
                const state = get()
                set({
                    events: relinkEvents(events, state.files),
                    undoStack: [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), state.events],
                    redoStack: [],
                })
            },
            removeEvent: (id) => {
                const state = get()
                set({
                    events: state.events.filter((e) => e.id !== id),
                    undoStack: [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), state.events],
                    redoStack: [],
                })
            },
            updateEvent: (id, partial) => {
                const state = get()
                set({
                    events: state.events.map((e) => (e.id === id ? { ...e, ...partial } : e)),
                    undoStack: [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), state.events],
                    redoStack: [],
                })
            },
            sortEvents: () => {
                const state = get()
                const sortedEvents = [...state.events].sort((a, b) => {
                    const aTime = (state.cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec
                    const bTime = (state.cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec
                    return aTime - bTime
                })
                set({
                    events: sortedEvents,
                    undoStack: [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), state.events],
                    redoStack: [],
                })
            },
            undo: () => {
                const state = get()
                if (state.undoStack.length === 0) return
                const previous = state.undoStack[state.undoStack.length - 1]
                set({
                    events: relinkEvents(previous, state.files),
                    undoStack: state.undoStack.slice(0, -1),
                    redoStack: [...state.redoStack, state.events],
                })
            },
            redo: () => {
                const state = get()
                if (state.redoStack.length === 0) return
                const next = state.redoStack[state.redoStack.length - 1]
                set({
                    events: relinkEvents(next, state.files),
                    redoStack: state.redoStack.slice(0, -1),
                    undoStack: [...state.undoStack, state.events],
                })
            },
            clear: () => set({ files: [], events: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0, matchStartTimeSec: 0, adjustTimestampsByOffset: false, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0, undoStack: [], redoStack: [], picker: null }),
            // Start a new game: drop events, videos and kick-off; keep teams, rosters and clip/replay settings.
            // Events go on the undo stack so an accidental clear can be undone.
            newMatch: () => {
                const state = get()
                for (const f of state.files) if (f.url) URL.revokeObjectURL(f.url)
                set({
                    files: [], events: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0,
                    matchStartTimeSec: 0, isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0, picker: null,
                    undoStack: [...state.undoStack.slice(-49), state.events], redoStack: [],
                })
            },
            setTeams: (teams) => set({ teams }),
            renameTeam: (index, name) => {
                const old = get().teams[index]?.name
                if (old === undefined) return
                set({
                    teams: get().teams.map((t, i) => (i === index ? { ...t, name } : t)),
                    events: get().events.map((e) => (e.team === old ? { ...e, team: name } : e)),
                })
            },
            addToRoster: (team, name) => set({
                teams: get().teams.map((t) =>
                    t.name === team && !t.roster.some((r) => r.toLowerCase() === name.toLowerCase())
                        ? { ...t, roster: [...t.roster, name] }
                        : t),
            }),
            markEvent: (timeInFileSec) => {
                const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                get().addEvent({ id, matchTimeSec: Math.floor(timeInFileSec), sourceFileIndex: get().currentFileIndex, type: 'goal' })
                set({ picker: { eventId: id } })
            },
            openPicker: (eventId) => set({ picker: { eventId } }),
            closePicker: () => set({ picker: null }),
            // Preview mode actions
            startPreview: () => {
                const state = get()
                const segments = mergeOverlappingGoalSegments(
                    linkedEvents(state.events),
                    state.cumulativeOffsets,
                    state.matchStartTimeSec,
                    state.adjustTimestampsByOffset,
                    state.lengthBeforeGoalSec,
                    state.lengthAfterGoalSec
                )
                if (segments.length > 0) {
                    set({
                        isPreviewMode: true,
                        previewSegments: segments,
                        currentPreviewSegment: 0
                    })
                }
            },
            exitPreview: () => set({ isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0 }),
            nextPreviewSegment: () => {
                const state = get()
                if (state.isPreviewMode && state.currentPreviewSegment < state.previewSegments.length - 1) {
                    set({ currentPreviewSegment: state.currentPreviewSegment + 1 })
                }
            },
            prevPreviewSegment: () => {
                const state = get()
                if (state.isPreviewMode && state.currentPreviewSegment > 0) {
                    set({ currentPreviewSegment: state.currentPreviewSegment - 1 })
                }
            },
        }},
        {
            name: 'vhm-state',
            // Persist events, match start time, and offset adjustment setting; files are ephemeral and cannot be restored across refresh
            partialize: (state) => ({
                events: state.events,
                matchStartTimeSec: state.matchStartTimeSec,
                adjustTimestampsByOffset: state.adjustTimestampsByOffset,
                lengthBeforeGoalSec: state.lengthBeforeGoalSec,
                lengthAfterGoalSec: state.lengthAfterGoalSec,
                replayBeforeSec: state.replayBeforeSec,
                replayAfterSec: state.replayAfterSec,
                replaySpeed: state.replaySpeed,
                teams: state.teams,
            }),
            version: 9,
            migrate: (persistedState: any, version: number) => {
                let state = persistedState ?? {}

                // Drop any previously persisted files
                if (state && 'files' in state) {
                    const { files, cumulativeOffsets, currentTimeInFileSec, ...rest } = state
                    state = rest
                }

                // Migrate goals → events (v7 → v8)
                if ('goals' in state) {
                    state = {
                        ...state,
                        events: (state.goals as any[]).map((g: any) => ({
                            ...g,
                            type: g.type ?? 'goal',
                        })),
                    }
                    delete state.goals
                }

                // Ensure every event has a current type (legacy moment/card → highlight/foul) (v9)
                if (state.events) {
                    state.events = (state.events as any[]).map((e: any) => migrateEvent(e))
                }

                if (version < 3 && !('matchStartTimeSec' in state)) {
                    state.matchStartTimeSec = 0
                }
                if (version < 5) {
                    delete state.slowMotionEnabled
                    delete state.slowMotionSpeed
                }
                if (version < 6 && !('adjustTimestampsByOffset' in state)) {
                    state.adjustTimestampsByOffset = false
                }
                if (version < 7) {
                    state.lengthBeforeGoalSec = state.lengthBeforeGoalSec ?? 10
                    state.lengthAfterGoalSec = state.lengthAfterGoalSec ?? 4
                }

                return state
            },
        }
    )
)
