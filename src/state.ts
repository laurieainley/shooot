import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Goal, VideoSourceFile } from './types'
import { computeCumulativeOffsets } from './utils/timeline'
import { mergeOverlappingGoalSegments, type HighlightSegment } from './utils/highlights'

type AppState = {
    files: VideoSourceFile[]
    goals: Goal[]
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
    addGoal: (goal: Goal) => void
    setGoals: (goals: Goal[]) => void
    removeGoal: (id: string) => void
    updateGoal: (id: string, partial: Partial<Goal>) => void
    sortGoals: () => void
    clear: () => void
    // Preview mode actions
    startPreview: () => void
    exitPreview: () => void
    nextPreviewSegment: () => void
    prevPreviewSegment: () => void
}

export const useAppState = create<AppState>()(
    persist(
        (set, get) => ({
            files: [],
            goals: [],
            cumulativeOffsets: [],
            currentTimeInFileSec: 0,
            currentFileIndex: 0,
            matchStartTimeSec: 0,
            adjustTimestampsByOffset: false,
            // Highlight length configuration
            lengthBeforeGoalSec: 10,
            lengthAfterGoalSec: 4,
            // Preview mode state
            isPreviewMode: false,
            previewSegments: [],
            currentPreviewSegment: 0,
            setFiles: (files) => set({ files, cumulativeOffsets: computeCumulativeOffsets(files) }),
            removeFile: (index) => {
                const currentFiles = get().files
                const newFiles = currentFiles.filter((_, i) => i !== index)
                const currentFileIndex = get().currentFileIndex
                const newFileIndex = Math.min(currentFileIndex, newFiles.length - 1)
                const newGoals = get().goals.filter(goal => (goal.sourceFileIndex ?? 0) !== index)
                // Adjust sourceFileIndex for goals that were after the removed file
                const adjustedGoals = newGoals.map(goal => ({
                    ...goal,
                    sourceFileIndex: goal.sourceFileIndex && goal.sourceFileIndex > index ? goal.sourceFileIndex - 1 : goal.sourceFileIndex
                }))
                set({
                    files: newFiles,
                    cumulativeOffsets: computeCumulativeOffsets(newFiles),
                    currentFileIndex: Math.max(0, newFileIndex),
                    goals: adjustedGoals
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
            addGoal: (goal) => {
                const newGoals = [...get().goals, goal]
                // Sort goals by timestamp after adding
                const sortedGoals = newGoals.sort((a, b) => {
                    const aTime = (get().cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec
                    const bTime = (get().cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec
                    return aTime - bTime
                })
                set({ goals: sortedGoals })
            },
            setGoals: (goals) => set({ goals }),
            removeGoal: (id) => set({ goals: get().goals.filter((g) => g.id !== id) }),
            updateGoal: (id, partial) =>
                set({ goals: get().goals.map((g) => (g.id === id ? { ...g, ...partial } : g)) }),
            sortGoals: () => {
                const sortedGoals = get().goals.sort((a, b) => {
                    const aTime = (get().cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec
                    const bTime = (get().cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec
                    return aTime - bTime
                })
                set({ goals: sortedGoals })
            },
            clear: () => set({ files: [], goals: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0, matchStartTimeSec: 0, adjustTimestampsByOffset: false, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0 }),
            // Preview mode actions
            startPreview: () => {
                const state = get()
                const segments = mergeOverlappingGoalSegments(
                    state.goals,
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
        }),
        {
            name: 'vhm-state',
            // Persist goals, match start time, and offset adjustment setting; files are ephemeral and cannot be restored across refresh
            partialize: (state) => ({
                goals: state.goals,
                matchStartTimeSec: state.matchStartTimeSec,
                adjustTimestampsByOffset: state.adjustTimestampsByOffset,
                lengthBeforeGoalSec: state.lengthBeforeGoalSec,
                lengthAfterGoalSec: state.lengthAfterGoalSec
            }),
            version: 7,
            migrate: (persistedState: any, version: number) => {
                // Drop any previously persisted files to avoid stale object URLs
                if (persistedState && 'files' in persistedState) {
                    const { files, cumulativeOffsets, currentTimeInFileSec, ...rest } = persistedState
                    return rest
                }

                // Add matchStartTimeSec if it doesn't exist (for version 2 -> 3 migration)
                if (version < 3 && persistedState && !('matchStartTimeSec' in persistedState)) {
                    return { ...persistedState, matchStartTimeSec: 0 }
                }

                // Remove slow motion settings (for version 4 -> 5 migration)
                if (version < 5 && persistedState) {
                    const { slowMotionEnabled, slowMotionSpeed, ...rest } = persistedState
                    return rest
                }

                // Add adjustTimestampsByOffset if it doesn't exist (for version 5 -> 6 migration)
                if (version < 6 && persistedState && !('adjustTimestampsByOffset' in persistedState)) {
                    return { ...persistedState, adjustTimestampsByOffset: false }
                }

                // Add highlight length settings if they don't exist (for version 6 -> 7 migration)
                if (version < 7 && persistedState) {
                    return {
                        ...persistedState,
                        lengthBeforeGoalSec: 10,
                        lengthAfterGoalSec: 4
                    }
                }

                return persistedState
            },
        }
    )
)


