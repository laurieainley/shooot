import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Goal, VideoSourceFile } from './types'
import { computeCumulativeOffsets } from './utils/timeline'

// Function to merge overlapping goal segments (reused from RenderHighlights)
function mergeOverlappingGoalSegments(goals: Goal[], cumulativeOffsets: number[], matchStartTimeSec: number, adjustTimestampsByOffset: boolean): HighlightSegment[] {
    if (goals.length === 0) return [];

    // Apply offset to goal times if enabled
    const adjustedGoals = goals.map(goal => ({
        ...goal,
        matchTimeSec: adjustTimestampsByOffset ? Math.max(0, goal.matchTimeSec - matchStartTimeSec) : goal.matchTimeSec
    }));

    // Sort goals by time
    const sortedGoals = [...adjustedGoals].sort((a, b) => {
        const aTime = (cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.matchTimeSec;
        const bTime = (cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.matchTimeSec;
        return aTime - bTime;
    });

    const merged: HighlightSegment[] = [];
    let currentSegment = {
        startTime: Math.max(0, sortedGoals[0].matchTimeSec - 10),
        endTime: sortedGoals[0].matchTimeSec + 4,
        sourceFileIndex: sortedGoals[0].sourceFileIndex ?? 0,
        goals: [sortedGoals[0]]
    };

    for (let i = 1; i < sortedGoals.length; i++) {
        const goal = sortedGoals[i];
        const goalTime = goal.matchTimeSec;
        const goalStart = Math.max(0, goalTime - 10);
        const goalEnd = goalTime + 4;

        // Check if this goal overlaps with the current segment
        if (goalStart <= currentSegment.endTime &&
            goal.sourceFileIndex === currentSegment.sourceFileIndex) {
            // Merge segments
            currentSegment.endTime = Math.max(currentSegment.endTime, goalEnd);
            currentSegment.goals.push(goal);
        } else {
            // No overlap, finalize current segment and start new one
            merged.push({
                ...currentSegment,
                duration: currentSegment.endTime - currentSegment.startTime
            });

            currentSegment = {
                startTime: goalStart,
                endTime: goalEnd,
                sourceFileIndex: goal.sourceFileIndex ?? 0,
                goals: [goal]
            };
        }
    }

    // Add the last segment
    merged.push({
        ...currentSegment,
        duration: currentSegment.endTime - currentSegment.startTime
    });

    return merged;
}

export type HighlightSegment = {
    startTime: number
    endTime: number
    sourceFileIndex: number
    goals: Goal[]
    duration: number
}

type AppState = {
    files: VideoSourceFile[]
    goals: Goal[]
    cumulativeOffsets: number[]
    currentTimeInFileSec: number
    currentFileIndex: number
    matchStartTimeSec: number
    adjustTimestampsByOffset: boolean
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
            clear: () => set({ files: [], goals: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0, matchStartTimeSec: 0, adjustTimestampsByOffset: false, isPreviewMode: false, previewSegments: [], currentPreviewSegment: 0 }),
            // Preview mode actions
            startPreview: () => {
                const state = get()
                const segments = mergeOverlappingGoalSegments(
                    state.goals,
                    state.cumulativeOffsets,
                    state.matchStartTimeSec,
                    state.adjustTimestampsByOffset
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
                adjustTimestampsByOffset: state.adjustTimestampsByOffset
            }),
            version: 6,
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

                return persistedState
            },
        }
    )
)


