import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GoalAreas, MarkerType, MatchEvent, Team, VideoSourceFile } from './types'
import { replayOptionsFor } from './utils/attack'
import { normaliseAreas } from './utils/crop'
import { migrateEvent } from './utils/eventTypes'
import { computeCumulativeOffsets } from './utils/timeline'
import { mergeOverlappingGoalSegments, type HighlightSegment } from './utils/highlights'
import { relinkEvents as relinkByKey, linkedEvents } from './utils/relink'
import { kickOffSec, resolveGlobalEvents, withMigratedKickOff } from './utils/matchClock'
import { parseGoProName } from './utils/gopro'
import { buildPreviewPlan, type PreviewStep } from './utils/preview'
import { normaliseGraphics, type GraphicsSettings } from './graphics/plan'

const DEFAULT_GRAPHICS: GraphicsSettings = { cards: true, lowerThirds: true, replayTag: false }
import type { FullMatchSettings } from './utils/exportPlans'

/** Links events to the loaded files: migrated whole-timeline times are placed first, then file keys matched. */
function relinkEvents(events: MatchEvent[], files: VideoSourceFile[]): MatchEvent[] {
    return relinkByKey(resolveGlobalEvents(events, files), files)
}

/** Menus and sheets; at most one is open, and never together with the event picker. */
export type Panel = 'menu' | 'files' | 'match' | 'settings' | 'paste' | 'export' | 'event' | 'send'

type AppState = {
    files: VideoSourceFile[]
    events: MatchEvent[]
    cumulativeOffsets: number[]
    currentTimeInFileSec: number
    currentFileIndex: number
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
    /** Clips and their replays, in reel order; `currentPreviewSegment` indexes these. */
    previewSteps: PreviewStep[]
    currentPreviewSegment: number
    setFiles: (files: VideoSourceFile[]) => void
    addFiles: (files: VideoSourceFile[]) => void
    moveFile: (from: number, to: number) => void
    removeFile: (index: number) => void
    replaceFile: (index: number, replacement: VideoSourceFile[]) => void
    /** Progress text while picked files are being opened, e.g. "Opening GX010226.MP4 (11.9 GB)…". */
    opening: string | null
    setOpening: (label: string | null) => void
    /** iPadOS: the picker is open or is still copying the chosen files (no `change` yet). */
    pickerWait: boolean
    /** Note shown after a pick (iPad large-file hint). */
    pickerNotice: string | null
    setPicker: (partial: { wait?: boolean; notice?: string | null }) => void
    attachFullFiles: (files: File[]) => string[]
    setCurrentTimeInFile: (t: number) => void
    setCurrentFileIndex: (idx: number) => void
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
    /** Make an event the Kick off / Final whistle, moving any existing one (single instance; one undo step). */
    placeMarker: (id: string, type: MarkerType) => void
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
    /**
     * The event the picker is editing. `pending` (touch ＋): the time was captured but no event exists yet; it is
     * created (one undo step) by `commitPending` when a type is chosen, and closing the picker creates nothing.
     */
    picker: { eventId: string; pending?: { matchTimeSec: number; sourceFileIndex: number } } | null
    setTeams: (teams: Team[]) => void
    renameTeam: (index: number, name: string) => void
    addToRoster: (team: string, name: string) => void
    markEvent: (timeInFileSec: number, opts?: { deferred?: boolean }) => void
    commitPending: () => void
    openPicker: (eventId: string) => void
    closePicker: () => void
    /** Landscape phones: the top bar folded away for more picture. */
    barCollapsed: boolean
    setBarCollapsed: (collapsed: boolean) => void
    /** CSS full-viewport player (fullscreen fallback when the Fullscreen API is missing or refused). */
    immersive: boolean
    setImmersive: (on: boolean) => void
    /** The player container is in real or CSS fullscreen (panels then become a compact overlay on the picture). */
    playerFullscreen: boolean
    setPlayerFullscreen: (on: boolean) => void
    panel: Panel | null
    /** The event the touch edit sheet (panel 'event') is editing. */
    editingEventId: string | null
    /** Open the edit sheet for an event (touch: tapping a row in the event log). */
    editEvent: (id: string) => void
    openPanel: (panel: Panel) => void
    closePanel: () => void
    // Match graphics (title/full-time cards, lower thirds)
    graphics: GraphicsSettings
    setGraphics: (partial: Partial<GraphicsSettings>) => void
    /** Export full match: VS / FT cards and the score bug (off / after goals / periodic every n minutes). */
    fullMatch: FullMatchSettings
    /** Which half of the Export panel is showing. */
    exportTab: 'highlights' | 'fullMatch'
    setExportTab: (tab: 'highlights' | 'fullMatch') => void
    setFullMatch: (partial: Partial<FullMatchSettings>) => void
    /** Matchday heading on the title card; null = "MATCH". */
    matchdayLabel: string | null
    setMatchdayLabel: (label: string | null) => void
    setTeamInitials: (index: number, initials: string) => void
    /** Replay zoom: where each team's goal is in the picture (null = not set). */
    goalAreas: GoalAreas | null
    setGoalAreas: (areas: GoalAreas | null) => void
}

/** Kick-off on the whole timeline (0 when not marked): match clocks, Home, chapters and the full match start there. */
export function selectMatchStartSec(s: Pick<AppState, 'events' | 'cumulativeOffsets'>): number {
    return kickOffSec(s.events, s.cumulativeOffsets)
}

/** The heading on the title card. */
export function matchdayText(s: Pick<AppState, 'matchdayLabel'>): string {
    return s.matchdayLabel?.trim() || 'MATCH'
}

export const useAppState = create<AppState>()(
    persist(
        (set, get) => {
            const MAX_UNDO_DEPTH = 50
            // The picker and the edit sheet each edit one event; they close when that event is gone (undo, delete, import).
            const follow = (events: MatchEvent[]): Pick<AppState, 'picker' | 'panel'> => {
                const { picker: p, panel, editingEventId } = get()
                return {
                    picker: p && (p.pending || events.some((e) => e.id === p.eventId)) ? p : null,
                    panel: panel === 'event' && !events.some((e) => e.id === editingEventId) ? null : panel,
                }
            }
            return {
            files: [],
            events: [],
            teams: [
                { name: 'Whites', color: '#f5f5f5', roster: [] },
                { name: 'Colours', color: '#c2364a', roster: [] },
            ],
            picker: null,
            panel: null,
            editingEventId: null,
            immersive: false,
            playerFullscreen: false,
            barCollapsed: false,
            opening: null,
            graphics: DEFAULT_GRAPHICS,
            matchdayLabel: null,
            goalAreas: null,
            cumulativeOffsets: [],
            currentTimeInFileSec: 0,
            currentFileIndex: 0,
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
            previewSteps: [],
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
            // Swap one entry for newly picked file(s); events on the old file become unlinked, as with remove.
            replaceFile: (index, replacement) => {
                const files = get().files
                if (index < 0 || index >= files.length || replacement.length === 0) return
                const old = files[index]
                if (old.url) URL.revokeObjectURL(old.url)
                get().setFiles([...files.slice(0, index), ...replacement, ...files.slice(index + 1)])
            },
            setOpening: (label) => set({ opening: label }),
            pickerWait: false,
            pickerNotice: null,
            setPicker: ({ wait, notice }) => set({
                ...(wait !== undefined ? { pickerWait: wait } : {}),
                ...(notice !== undefined ? { pickerNotice: notice } : {}),
            }),
            setCurrentTimeInFile: (t) => set({ currentTimeInFileSec: t }),
            setCurrentFileIndex: (idx) => set({ currentFileIndex: Math.max(0, Math.min(idx, get().files.length - 1)) }),
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
                const next = relinkEvents(events, state.files)
                set({
                    events: next,
                    ...follow(next),
                    undoStack: [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), state.events],
                    redoStack: [],
                })
            },
            removeEvent: (id) => {
                const state = get()
                const next = state.events.filter((e) => e.id !== id)
                set({
                    events: next,
                    ...follow(next),
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
            placeMarker: (id, type) => {
                const state = get()
                if (!state.events.some((e) => e.id === id)) return
                const next = state.events
                    .filter((e) => e.id === id || e.type !== type)
                    .map((e) => {
                        if (e.id !== id) return e
                        const m: MatchEvent = { ...e, type }
                        for (const k of ['team', 'scorer', 'notes', 'replay', 'pen'] as const) delete m[k]
                        return m
                    })
                set({
                    events: next,
                    ...follow(next),
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
                const previous = relinkEvents(state.undoStack[state.undoStack.length - 1], state.files)
                set({
                    events: previous,
                    ...follow(previous),
                    undoStack: state.undoStack.slice(0, -1),
                    redoStack: [...state.redoStack, state.events],
                })
            },
            redo: () => {
                const state = get()
                if (state.redoStack.length === 0) return
                const next = relinkEvents(state.redoStack[state.redoStack.length - 1], state.files)
                set({
                    events: next,
                    ...follow(next),
                    redoStack: state.redoStack.slice(0, -1),
                    undoStack: [...state.undoStack, state.events],
                })
            },
            clear: () => set({ files: [], events: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0, adjustTimestampsByOffset: false, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4, isPreviewMode: false, previewSegments: [], previewSteps: [], currentPreviewSegment: 0, undoStack: [], redoStack: [], picker: null }),
            // Start a new game: drop events, videos and kick-off; keep teams, rosters and clip/replay settings.
            // Events go on the undo stack so an accidental clear can be undone.
            newMatch: () => {
                const state = get()
                for (const f of state.files) if (f.url) URL.revokeObjectURL(f.url)
                set({
                    files: [], events: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0,
                    isPreviewMode: false, previewSegments: [], previewSteps: [], currentPreviewSegment: 0, picker: null, panel: null,
                    undoStack: [...state.undoStack.slice(-49), state.events], redoStack: [],
                    matchdayLabel: null, goalAreas: null,
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
            markEvent: (timeInFileSec, opts) => {
                const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                const matchTimeSec = Math.floor(timeInFileSec)
                const sourceFileIndex = get().currentFileIndex
                if (opts?.deferred) {
                    set({ picker: { eventId: id, pending: { matchTimeSec, sourceFileIndex } }, panel: null })
                    return
                }
                get().addEvent({ id, matchTimeSec, sourceFileIndex, type: 'goal' })
                set({ picker: { eventId: id }, panel: null })
            },
            commitPending: () => {
                const pending = get().picker?.pending
                const picker = get().picker
                if (!picker || !pending) return
                get().addEvent({ id: picker.eventId, ...pending, type: 'goal' })
                set({ picker: { eventId: picker.eventId } })
            },
            openPicker: (eventId) => set({ picker: { eventId }, panel: null }),
            closePicker: () => set({ picker: null }),
            setGraphics: (partial) => set({ graphics: normaliseGraphics({ ...get().graphics, ...partial }, get().graphics) }),
            fullMatch: { cards: true, scoreBug: 'periodic', intervalMin: 5 },
            exportTab: 'highlights',
            setExportTab: (tab) => set({ exportTab: tab }),
            setFullMatch: (partial) => set({ fullMatch: { ...get().fullMatch, ...partial } }),
            setGoalAreas: (areas) => set({ goalAreas: areas ? normaliseAreas(areas) : null }),
            setMatchdayLabel: (label) => set({ matchdayLabel: label?.trim() ? label : null }),
            setTeamInitials: (index, initials) => set({
                teams: get().teams.map((t, i) => {
                    if (i !== index) return t
                    const next = { ...t }
                    const v = initials.trim().toUpperCase().slice(0, 3)
                    if (v) next.initials = v
                    else delete next.initials
                    return next
                }),
            }),
            setImmersive: (on) => set({ immersive: on }),
            setPlayerFullscreen: (on) => { if (get().playerFullscreen !== on) set({ playerFullscreen: on }) },
            setBarCollapsed: (collapsed) => set({ barCollapsed: collapsed }),
            editEvent: (id) => {
                if (get().events.some((e) => e.id === id)) set({ panel: 'event', editingEventId: id, picker: null })
            },
            openPanel: (panel) => set({ panel, picker: null }),
            closePanel: () => set({ panel: null }),
            // Preview mode actions
            startPreview: () => {
                const state = get()
                const segments = mergeOverlappingGoalSegments(
                    linkedEvents(state.events),
                    state.cumulativeOffsets,
                    selectMatchStartSec(state),
                    state.adjustTimestampsByOffset,
                    state.lengthBeforeGoalSec,
                    state.lengthAfterGoalSec
                )
                const steps = buildPreviewPlan(segments, state.files.map((f) => f.durationSec ?? Infinity),
                    replayOptionsFor({ ...state, events: linkedEvents(state.events) }))
                if (steps.length > 0) {
                    set({
                        isPreviewMode: true,
                        previewSegments: segments,
                        previewSteps: steps,
                        currentPreviewSegment: 0,
                        picker: null,
                        panel: null,
                    })
                }
            },
            exitPreview: () => set({ isPreviewMode: false, previewSegments: [], previewSteps: [], currentPreviewSegment: 0 }),
            nextPreviewSegment: () => {
                const state = get()
                if (state.isPreviewMode && state.currentPreviewSegment < state.previewSteps.length - 1) {
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
                adjustTimestampsByOffset: state.adjustTimestampsByOffset,
                lengthBeforeGoalSec: state.lengthBeforeGoalSec,
                lengthAfterGoalSec: state.lengthAfterGoalSec,
                replayBeforeSec: state.replayBeforeSec,
                replayAfterSec: state.replayAfterSec,
                replaySpeed: state.replaySpeed,
                teams: state.teams,
                graphics: state.graphics,
                fullMatch: state.fullMatch,
                matchdayLabel: state.matchdayLabel,
                goalAreas: state.goalAreas,
                barCollapsed: state.barCollapsed,
            }),
            version: 12,
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
                    state.events = (state.events as any[]).map((e: any) => migrateEvent(e, state.whitesAttackLeft ?? true))
                }

                // Match setup's start time became the Kick off event (v10).
                if ('matchStartTimeSec' in state) {
                    state.events = withMigratedKickOff(state.events ?? [], Number(state.matchStartTimeSec) || 0)
                    delete state.matchStartTimeSec
                }
                if (version < 5) {
                    delete state.slowMotionEnabled
                    delete state.slowMotionSpeed
                }
                if (version < 6 && !('adjustTimestampsByOffset' in state)) {
                    state.adjustTimestampsByOffset = false
                }
                // The card heading no longer counts matches (it says MATCH unless a matchday is typed).
                delete state.matchNumber
                if (version < 7) {
                    state.lengthBeforeGoalSec = state.lengthBeforeGoalSec ?? 10
                    state.lengthAfterGoalSec = state.lengthAfterGoalSec ?? 4
                }

                // The "score always on screen" option and its measured re-encode speed were removed (v11).
                if (version < 11) {
                    if ('graphics' in state) state.graphics = normaliseGraphics(state.graphics, DEFAULT_GRAPHICS)
                    delete state.reencodeSecPerSec
                }

                // Goal areas belong to teams, not to left / right (v12): the box the first team attacked is the second team's goal.
                if (version < 12) {
                    state.goalAreas = normaliseAreas(state.goalAreas, state.whitesAttackLeft ?? true)
                    delete state.whitesAttackLeft
                }

                return state
            },
        }
    )
)
