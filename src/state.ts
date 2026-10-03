import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MatchEvent, VideoSourceFile } from './types'
import { computeCumulativeOffsets } from './utils/timeline'
import { mergeOverlappingGoalSegments, type HighlightSegment } from './utils/highlights'
import { relinkEvents, linkedEvents } from './utils/relink'

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
    // Preview mode state
    isPreviewMode: boolean
    previewSegments: HighlightSegment[]
    currentPreviewSegment: number
    setFiles: (files: VideoSourceFile[]) => void
    addFiles: (files: VideoSourceFile[]) => void
    moveFile: (from: number, to: number) => void
    removeFile: (index: number) => void
    setCurrentTimeInFile: (t: number) => void
    setCurrentFileIndex: (idx: number) => void
    setMatchStartTime: (time: number) => void
    setAdjustTimestampsByOffset: (adjust: boolean) => void
    setLengthBeforeGoal: (seconds: number) => void
    setLengthAfterGoal: (seconds: number) => void
    seekToGoal: (fileIndex: number, timeSec: number) => void
    nextFile: () => void
    prevFile: () => void
    addEvent: (event: MatchEvent) => void
    setEvents: (events: MatchEvent[]) => void
    removeEvent: (id: string) => void
    updateEvent: (id: string, partial: Partial<MatchEvent>) => void
    sortEvents: () => void
    clear: () => void
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
}

export const useAppState = create<AppState>()(
    persist(
        (set, get) => {
            const MAX_UNDO_DEPTH = 50
            return {
            files: [],
            events: [],
            cumulativeOffsets: [],
            currentTimeInFileSec: 0,
            currentFileIndex: 0,
            matchStartTimeSec: 0,
            adjustTimestampsByOffset: false,
            // Highlight length configuration
            lengthBeforeGoalSec: 10,
            lengthAfterGoalSec: 4,
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
            seekToGoal: (fileIndex, timeSec) => {
                // This will be handled by the Player component via a custom event
                const event = new CustomEvent('seekToGoal', {
                    detail: { fileIndex, timeSec }
                })
                window.dispatchEvent(event)
            },
            nextFile: () => set({ currentFileIndex: Math.min(get().currentFileIndex + 1, get().files.length - 1) }),
            prevFile: () => set({ currentFileIndex: Math.max(get().currentFileIndex - 1, 0) }),
            addEvent: (event) => {
                const state = get()
                const prevEvents = state.events
                const newEvents = relinkEvents([...prevEvents, event], state.files)
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
            clear: () => set({ files: [], events: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0, matchStartTimeSec: 0, adjustTimestampsByOffset: false, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0, undoStack: [], redoStack: [] }),
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
                lengthAfterGoalSec: state.lengthAfterGoalSec
            }),
            version: 8,
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

                // Ensure all events have a type field
                if (state.events) {
                    state.events = (state.events as any[]).map((e: any) => ({
                        ...e,
                        type: e.type ?? 'goal',
                    }))
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
