import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Goal, VideoSourceFile } from './types'
import { computeCumulativeOffsets } from './utils/timeline'

type AppState = {
    files: VideoSourceFile[]
    goals: Goal[]
    cumulativeOffsets: number[]
    currentTimeInFileSec: number
    currentFileIndex: number
    setFiles: (files: VideoSourceFile[]) => void
    setCurrentTimeInFile: (t: number) => void
    setCurrentFileIndex: (idx: number) => void
    nextFile: () => void
    prevFile: () => void
    addGoal: (goal: Goal) => void
    setGoals: (goals: Goal[]) => void
    removeGoal: (id: string) => void
    updateGoal: (id: string, partial: Partial<Goal>) => void
    clear: () => void
}

export const useAppState = create<AppState>()(
    persist(
        (set, get) => ({
            files: [],
            goals: [],
            cumulativeOffsets: [],
            currentTimeInFileSec: 0,
            currentFileIndex: 0,
            setFiles: (files) => set({ files, cumulativeOffsets: computeCumulativeOffsets(files) }),
            setCurrentTimeInFile: (t) => set({ currentTimeInFileSec: t }),
            setCurrentFileIndex: (idx) => set({ currentFileIndex: Math.max(0, Math.min(idx, get().files.length - 1)) }),
            nextFile: () => set({ currentFileIndex: Math.min(get().currentFileIndex + 1, get().files.length - 1) }),
            prevFile: () => set({ currentFileIndex: Math.max(get().currentFileIndex - 1, 0) }),
            addGoal: (goal) => set({ goals: [...get().goals, goal] }),
            setGoals: (goals) => set({ goals }),
            removeGoal: (id) => set({ goals: get().goals.filter((g) => g.id !== id) }),
            updateGoal: (id, partial) =>
                set({ goals: get().goals.map((g) => (g.id === id ? { ...g, ...partial } : g)) }),
            clear: () => set({ files: [], goals: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0 }),
        }),
        {
            name: 'vhm-state',
            // Persist goals only; files are ephemeral and cannot be restored across refresh
            partialize: (state) => ({ goals: state.goals }),
            version: 2,
            migrate: (persistedState: any) => {
                // Drop any previously persisted files to avoid stale object URLs
                if (persistedState && 'files' in persistedState) {
                    const { files, cumulativeOffsets, currentTimeInFileSec, ...rest } = persistedState
                    return rest
                }
                return persistedState
            },
        }
    )
)


