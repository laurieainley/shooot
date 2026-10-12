import { describe, it, expect, beforeEach } from 'vitest'
import { matchdayText, selectMatchStartSec, useAppState } from './state'
import type { GoalMarks, MatchEvent, VideoSourceFile } from './types'
import { goalRectFromMarks } from './utils/goalMarks'
import { effectiveStatus, reviewCounts } from './utils/suggestions'

const vf = (name: string): VideoSourceFile => ({ id: name, name, url: '', file: new File([''], name), durationSec: 100, kind: 'full' })
const goalIn = (fileIndex: number, id = `g${fileIndex}`): MatchEvent => ({ id, matchTimeSec: 10, sourceFileIndex: fileIndex, type: 'goal' })
const s = () => useAppState.getState()

describe('file changes keep events', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 0 })
        s().setFiles([vf('a.mp4'), vf('b.mp4')])
        s().addEvent(goalIn(0, 'ga'))
        s().addEvent(goalIn(1, 'gb'))
    })

    it('should stamp new events with their file key', () => {
        expect(s().events.map((e) => e.sourceFileKey)).toEqual(['a.mp4', 'b.mp4'])
    })

    it('should append files with addFiles and keep event links', () => {
        s().addFiles([vf('c.mp4')])
        expect(s().files.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4', 'c.mp4'])
        expect(s().events.map((e) => e.sourceFileIndex)).toEqual([0, 1])
    })

    it('should keep events of a removed file as unlinked and shift later ones', () => {
        s().removeFile(0)
        const [ga, gb] = [s().events.find((e) => e.id === 'ga')!, s().events.find((e) => e.id === 'gb')!]
        expect(ga.unlinked).toBe(true)
        expect(gb).toMatchObject({ sourceFileIndex: 0 })
        expect(gb.unlinked).toBeUndefined()
    })

    it('should relink when a removed file is added back', () => {
        s().removeFile(0)
        s().addFiles([vf('a.mp4')])
        const ga = s().events.find((e) => e.id === 'ga')!
        expect(ga.unlinked).toBeUndefined()
        expect(ga.sourceFileIndex).toBe(1)
    })

    it('should move events with their file on reorder', () => {
        s().moveFile(0, 1)
        expect(s().files.map((f) => f.name)).toEqual(['b.mp4', 'a.mp4'])
        expect(s().events.find((e) => e.id === 'ga')!.sourceFileIndex).toBe(1)
        expect(s().events.find((e) => e.id === 'gb')!.sourceFileIndex).toBe(0)
    })

    it('should ignore out-of-range moves', () => {
        s().moveFile(0, -1)
        expect(s().files.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4'])
    })

    it('should relink on undo', () => {
        // snapshot taken by addEvent has ga at index 0; the move happens after, so undo must relink
        s().addEvent(goalIn(0, 'gc'))
        s().moveFile(0, 1)
        s().undo()
        expect(s().events.find((e) => e.id === 'ga')!.sourceFileIndex).toBe(1)
    })

    it('should exclude unlinked events from preview segments', () => {
        s().removeFile(0)
        s().startPreview()
        expect(s().previewSegments.flatMap((seg) => seg.goals.map((g) => g.id))).toEqual(['gb'])
    })
})

describe('teams and picker', () => {
    beforeEach(() => {
        useAppState.setState({ files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null })
    })

    it('should default to two named teams with empty rosters', () => {
        const t = useAppState.getInitialState().teams
        expect(t.map((x) => x.name)).toEqual(['Whites', 'Colours'])
        expect(t.every((x) => x.roster.length === 0)).toBe(true)
    })

    it('should mark a goal at the given time and open the picker on it', () => {
        s().markEvent(42.9)
        const [e] = s().events
        expect(e).toMatchObject({ matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
        expect(s().picker).toEqual({ eventId: e.id, fresh: true })
        s().closePicker()
        expect(s().picker).toBeNull()
    })

    describe('deferred marking (touch ＋)', () => {
        it('should capture the time and file but create no event until commitPending', () => {
            s().markEvent(42.9, { deferred: true })
            expect(s().events).toEqual([])
            expect(s().undoStack).toEqual([])
            const picker = s().picker!
            expect(picker.pending).toEqual({ matchTimeSec: 42, sourceFileIndex: 0 })
            s().commitPending()
            expect(s().events).toHaveLength(1)
            expect(s().events[0]).toMatchObject({ id: picker.eventId, matchTimeSec: 42, sourceFileIndex: 0, type: 'goal' })
            expect(s().picker).toEqual({ eventId: picker.eventId, fresh: true })
            expect(s().undoStack).toHaveLength(1)
        })

        it('should create nothing when the picker closes without a choice', () => {
            s().markEvent(10, { deferred: true })
            s().closePicker()
            expect(s().events).toEqual([])
            expect(s().picker).toBeNull()
            expect(s().undoStack).toEqual([])
        })

        it('should survive unrelated store changes while pending and close when a panel opens', () => {
            s().markEvent(10, { deferred: true })
            s().addEvent({ id: 'other', matchTimeSec: 1, sourceFileIndex: 0, type: 'goal' })
            expect(s().picker?.pending).toBeDefined()
            s().openPanel('menu')
            expect(s().picker).toBeNull()
            expect(s().events).toHaveLength(1)
        })

        it('should do nothing on commitPending without a pending mark', () => {
            s().commitPending()
            expect(s().events).toEqual([])
        })
    })

    it('should rename a team and update its events', () => {
        s().setTeams([{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#f00', roster: [] }])
        s().addEvent({ id: 'e', matchTimeSec: 1, sourceFileIndex: 0, type: 'goal', team: 'Whites' })
        s().renameTeam(0, 'Lights')
        expect(s().teams[0].name).toBe('Lights')
        expect(s().events[0].team).toBe('Lights')
    })

    it('should add to a roster without duplicates', () => {
        s().setTeams([{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: [] }])
        s().addToRoster('Whites', 'Jo')
        s().addToRoster('Whites', 'sam')
        expect(s().teams[0].roster).toEqual(['Sam', 'Jo'])
    })

    it('should keep teams on clear()', () => {
        s().setTeams([{ name: 'A', color: '#fff', roster: ['x'] }, { name: 'B', color: '#f00', roster: [] }])
        s().clear()
        expect(s().teams[0]).toMatchObject({ name: 'A', roster: ['x'] })
    })

    it('should drop the removed adjustTimestampsByOffset setting (v18)', () => {
        const migrate = useAppState.persist.getOptions().migrate!
        const out = migrate({ adjustTimestampsByOffset: true, lengthBeforeGoalSec: 8 }, 17) as Record<string, unknown>
        expect('adjustTimestampsByOffset' in out).toBe(false)
        expect(out.lengthBeforeGoalSec).toBe(8)
    })

    it('should migrate v8 legacy event types and persist teams (v9+)', () => {
        const opts = useAppState.persist.getOptions()
        expect(opts.version).toBe(21)
        const migrated = opts.migrate!({ events: [{ id: 'a', matchTimeSec: 1, type: 'moment' }, { id: 'b', matchTimeSec: 2, type: 'card' }] }, 8) as { events: MatchEvent[] }
        expect(migrated.events.map((e) => e.type)).toEqual(['highlight', 'foul'])
        expect(opts.partialize!(s())).toHaveProperty('teams')
    })

    it('should turn persisted penalty_awarded events into penalty_conceded with the team flipped (v14)', () => {
        const teams = [{ name: 'Whites', color: '#fff', roster: ['Sam'] }, { name: 'Colours', color: '#f00', roster: ['Jo'] }]
        const old = { teams, events: [
            { id: 'a', matchTimeSec: 1, type: 'penalty_awarded', team: 'Whites', scorer: 'Sam' },
            { id: 'b', matchTimeSec: 2, type: 'penalty_awarded' },
        ] }
        const out = useAppState.persist.getOptions().migrate!(old, 13) as { events: MatchEvent[] }
        expect(out.events[0]).toMatchObject({ type: 'penalty_conceded', team: 'Colours' })
        expect(out.events[0].scorer).toBeUndefined()
        expect(out.events[1]).toMatchObject({ type: 'penalty_conceded' })
        expect(out.events[1].team).toBeUndefined()
    })

    it('should add the full-match replays switch, off (v21)', () => {
        const migrate = useAppState.persist.getOptions().migrate!
        const out = migrate({ fullMatch: { cards: true, scoreBug: 'off', intervalMin: 5, captions: true } }, 20) as { fullMatch: { replays: boolean } }
        expect(out.fullMatch.replays).toBe(false)
        expect((migrate({}, 20) as Record<string, unknown>).fullMatch).toBeUndefined()
    })

    it('should switch on full-match event captions once (v15)', () => {
        const migrate = useAppState.persist.getOptions().migrate!
        const out = migrate({ fullMatch: { cards: true, scoreBug: 'off', intervalMin: 5, captions: false } }, 14) as { fullMatch: { captions: boolean } }
        expect(out.fullMatch.captions).toBe(true)
        expect((migrate({ fullMatch: { cards: true, scoreBug: 'off', intervalMin: 5, captions: false } }, 15) as { fullMatch: { captions: boolean } }).fullMatch.captions).toBe(false)
    })

    it('should switch on the replay tag and set the full-match score bug to after goals once (v13)', () => {
        const migrate = useAppState.persist.getOptions().migrate!
        const out = migrate({ graphics: { cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' }, fullMatch: { cards: false, scoreBug: 'periodic', intervalMin: 7 } }, 12) as { graphics: { replayTag: boolean }; fullMatch: unknown }
        expect(out.graphics.replayTag).toBe(true)
        expect(out.fullMatch).toEqual({ cards: false, scoreBug: 'goals', intervalMin: 7, captions: true, replays: false })
        const fresh = migrate({}, 12) as Record<string, unknown>
        expect(fresh.graphics).toBeUndefined()
        expect(fresh.fullMatch).toBeUndefined()
    })

    it('should migrate left / right goal areas and replay framing to teams (v12)', () => {
        const left = { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }
        const right = { x: 0.56, y: 0.3, w: 0.4, h: 0.4 }
        const old = { events: [{ id: 'a', matchTimeSec: 1, type: 'goal', replayCrop: 'right' }], goalAreas: { left, right }, whitesAttackLeft: true }
        const migrated = useAppState.persist.getOptions().migrate!(old, 11) as { events: MatchEvent[]; goalAreas: unknown; whitesAttackLeft?: boolean }
        expect(migrated.goalAreas).toEqual({ team1: right, team2: left })
        expect(migrated.events[0].replayCrop).toBe('team1')
        expect(migrated).not.toHaveProperty('whitesAttackLeft')
    })
})

describe('attachFullFiles', () => {
    const proxy = (name: string): VideoSourceFile =>
        ({ id: name, file: new File([''], name), url: '', name, kind: 'proxy', durationSec: 100 })

    beforeEach(() => useAppState.setState({ files: [proxy('GL010226.LRV'), proxy('GL010227.LRV')] }))

    it('should attach matching full files and report unmatched names', () => {
        const unmatched = s().attachFullFiles([new File([''], 'GX010226.MP4'), new File([''], 'GX019999.MP4')])
        const files = s().files
        expect(files[0].fullFile?.name).toBe('GX010226.MP4')
        expect(files[1].fullFile).toBeUndefined()
        expect(unmatched).toEqual(['GX019999.MP4'])
    })
})

describe('replay settings', () => {
    it('should default to 4 s before, 1 s after, 0.5× and persist them', () => {
        const init = useAppState.getInitialState()
        expect([init.replayBeforeSec, init.replayAfterSec, init.replaySpeed]).toEqual([4, 1, 0.5])
        s().setReplayWindow(2, 2)
        s().setReplaySpeed(0.25)
        expect([s().replayBeforeSec, s().replayAfterSec, s().replaySpeed]).toEqual([2, 2, 0.25])
        const persisted = JSON.parse(localStorage.getItem('vhm-state') ?? '{}').state
        expect(persisted).toMatchObject({ replayBeforeSec: 2, replayAfterSec: 2, replaySpeed: 0.25 })
    })
    it('should clamp the window to 0..15 s and speed to 0.25 or 0.5', () => {
        s().setReplayWindow(-1, 99)
        expect([s().replayBeforeSec, s().replayAfterSec]).toEqual([0, 15])
        s().setReplaySpeed(0.3)
        expect(s().replaySpeed).toBe(0.25)
    })
})

describe('addEvents', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 0 })
        s().setFiles([vf('a.mp4'), vf('b.mp4')])
        s().addEvent({ id: 'x', matchTimeSec: 50, sourceFileIndex: 0, type: 'goal' })
    })

    it('should add several events sorted on the timeline, linked to their files, as one undo step', () => {
        s().addEvents([
            { id: 'late', matchTimeSec: 5, sourceFileIndex: 1, type: 'goal' },
            { id: 'early', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal' },
        ])
        expect(s().events.map((e) => e.id)).toEqual(['early', 'x', 'late'])
        expect(s().events.find((e) => e.id === 'late')?.sourceFileKey).toBe('b.mp4')
        s().undo()
        expect(s().events.map((e) => e.id)).toEqual(['x'])
    })

    it('should do nothing for an empty list', () => {
        const undoDepth = s().undoStack.length
        s().addEvents([])
        expect(s().undoStack.length).toBe(undoDepth)
    })
})

describe('newMatch', () => {
    it('should clear events, files and kick-off but keep teams and clip/replay settings, undoably', () => {
        const teams = [{ name: 'Lights', color: '#fff', roster: ['Sam'] }, { name: 'Darks', color: '#000', roster: [] }]
        useAppState.setState({
            files: [vf('a.mp4')], cumulativeOffsets: [0], currentFileIndex: 0,
            events: [{ id: 'e', matchTimeSec: 100, sourceFileIndex: 0, sourceFileKey: 'a.mp4', type: 'goal' }],
            teams, lengthBeforeGoalSec: 12, replaySpeed: 0.25, undoStack: [], redoStack: [], picker: { eventId: 'e' },
        })
        s().newMatch()
        expect(s()).toMatchObject({ files: [], events: [], cumulativeOffsets: [], picker: null, teams, lengthBeforeGoalSec: 12, replaySpeed: 0.25 })
        s().undo()
        expect(s().events.map((e) => e.id)).toEqual(['e'])
    })
})

describe('panels and the picker', () => {
    beforeEach(() => {
        useAppState.setState({ files: [vf('a.mp4')], events: [], cumulativeOffsets: [0], currentFileIndex: 0, undoStack: [], redoStack: [], picker: null, panel: null })
    })

    it('should open one panel at a time', () => {
        s().openPanel('menu')
        expect(s().panel).toBe('menu')
        s().openPanel('settings')
        expect(s().panel).toBe('settings')
        s().closePanel()
        expect(s().panel).toBeNull()
    })

    it('should close the picker (keeping the event) when a panel opens', () => {
        s().markEvent(10)
        s().openPanel('menu')
        expect(s().picker).toBeNull()
        expect(s().events).toHaveLength(1)
    })

    it('should close any panel when an event is marked', () => {
        s().openPanel('files')
        s().markEvent(10)
        expect(s().panel).toBeNull()
        expect(s().picker).not.toBeNull()
    })

    it('should clear the picker when its event goes away (undo, remove, new match)', () => {
        s().markEvent(10)
        s().undo()
        expect(s().picker).toBeNull()
        s().markEvent(20)
        s().removeEvent(s().events[0].id)
        expect(s().picker).toBeNull()
        s().markEvent(30)
        s().setEvents([])
        expect(s().picker).toBeNull()
    })

    it('should open the edit sheet for one event as a panel, closing the picker and other panels', () => {
        s().addEvent({ id: 'a', matchTimeSec: 1, sourceFileIndex: 0, type: 'highlight' })
        s().markEvent(10)
        s().editEvent('a')
        expect(s().panel).toBe('event')
        expect(s().editingEventId).toBe('a')
        expect(s().picker).toBeNull()
        s().openPanel('menu')
        expect(s().panel).toBe('menu')
    })

    it('should close the edit sheet when its event goes away (delete, undo)', () => {
        s().addEvent({ id: 'a', matchTimeSec: 1, sourceFileIndex: 0, type: 'highlight' })
        s().editEvent('a')
        s().removeEvent('a')
        expect(s().panel).toBeNull()
        s().editEvent(s().events[0]?.id ?? 'missing')
        expect(s().panel).toBeNull()
        s().undo()
        s().editEvent('a')
        s().undo()
        expect(s().panel).toBeNull()
    })

    it('should keep the picker when an unrelated event changes', () => {
        s().addEvent({ id: 'other', matchTimeSec: 1, sourceFileIndex: 0, type: 'highlight' })
        s().markEvent(10)
        s().removeEvent('other')
        expect(s().picker).not.toBeNull()
    })
})

describe('replaceFile', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 1 })
        s().setFiles([vf('a.mp4'), vf('b.mp4')])
        s().addEvent(goalIn(0, 'ga'))
        s().addEvent(goalIn(1, 'gb'))
    })

    it('should put the replacement files in place of one entry and recompute offsets', () => {
        s().replaceFile(0, [vf('c.mp4'), vf('d.mp4')])
        expect(s().files.map((f) => f.name)).toEqual(['c.mp4', 'd.mp4', 'b.mp4'])
        expect(s().cumulativeOffsets).toEqual([0, 100, 200])
    })

    it('should unlink events of the old file and keep the others linked', () => {
        s().replaceFile(0, [vf('c.mp4')])
        expect(s().events.find((e) => e.id === 'ga')!.unlinked).toBe(true)
        expect(s().events.find((e) => e.id === 'gb')).toMatchObject({ sourceFileIndex: 1 })
        expect(s().events.find((e) => e.id === 'gb')!.unlinked).toBeUndefined()
    })
})

describe('preview', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 0, isPreviewMode: false,
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5,
        })
        s().setFiles([vf('a.mp4')])
        s().addEvent({ id: 'g', matchTimeSec: 50, sourceFileIndex: 0, type: 'goal' })
        s().addEvent({ id: 'h', matchTimeSec: 80, sourceFileIndex: 0, type: 'highlight' })
    })

    it('should start at the first step and include the replays at replay speed', () => {
        s().startPreview()
        expect(s().currentPreviewSegment).toBe(0)
        expect(s().previewSteps.map((p) => [p.clipIndex, p.replay, p.speed])).toEqual([[0, false, 1], [0, true, 0.5], [1, false, 1]])
    })

    it('should start again from the first clip every time', () => {
        s().startPreview()
        s().nextPreviewSegment()
        s().nextPreviewSegment()
        expect(s().currentPreviewSegment).toBe(2)
        s().nextPreviewSegment()
        expect(s().currentPreviewSegment).toBe(2)
        s().exitPreview()
        s().startPreview()
        expect(s().currentPreviewSegment).toBe(0)
    })
})

describe('match graphics settings', () => {
    beforeEach(() => {
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' }, matchdayLabel: null })
    })

    it('should default to cards and lower thirds on, replay tag off', () => {
        expect(s().graphics).toEqual({ cards: true, lowerThirds: true, replayTag: false, theme: 'shooot' })
    })

    it('should ignore a legacy score-always-on field when graphics are set', () => {
        s().setGraphics({ cards: false, scoreBug: true } as never)
        expect(s().graphics).toEqual({ cards: false, lowerThirds: true, replayTag: false, theme: 'shooot' })
    })

    it('should toggle one graphic at a time', () => {
        s().setGraphics({ replayTag: true })
        s().setGraphics({ cards: false })
        expect(s().graphics).toEqual({ cards: false, lowerThirds: true, replayTag: true, theme: 'shooot' })
    })

    it('should head the card MATCH until a matchday is typed', () => {
        expect(matchdayText(s())).toBe('MATCH')
        s().setMatchdayLabel('Cup final')
        expect(matchdayText(s())).toBe('Cup final')
        s().setMatchdayLabel('  ')
        expect(matchdayText(s())).toBe('MATCH')
    })

    it('should clear the matchday on New match without counting matches', () => {
        s().setMatchdayLabel('Cup final')
        s().newMatch()
        expect(matchdayText(s())).toBe('MATCH')
        expect(s()).not.toHaveProperty('matchNumber')
    })

    it('should store team initials, clearing them when blank', () => {
        useAppState.setState({ teams: [{ name: 'Whites', color: '#f0f0f0', roster: [] }, { name: 'Colours', color: '#ec5fa4', roster: [] }] })
        s().setTeamInitials(1, 'wt')
        expect(s().teams[1].initials).toBe('WT')
        s().setTeamInitials(1, ' ')
        expect(s().teams[1].initials).toBeUndefined()
    })

    it('should persist graphics settings and the matchday', () => {
        const persisted = useAppState.persist.getOptions().partialize!(s()) as Record<string, unknown>
        expect(persisted).toMatchObject({ graphics: s().graphics, matchdayLabel: null })
        expect(persisted).not.toHaveProperty('matchNumber')
    })
})

describe('match markers (kick off / final whistle)', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 0, picker: null, panel: null })
        s().setFiles([vf('a.mp4'), vf('b.mp4')])
    })

    it('should turn an event into a marker without team, person, note or replay', () => {
        s().addEvent({ id: 'k1', matchTimeSec: 30, sourceFileIndex: 0, type: 'goal', team: 'Whites', scorer: 'Sam', notes: 'x', replay: true, pen: true })
        s().placeMarker('k1', 'kick_off')
        const k = s().events.find((e) => e.id === 'k1')!
        expect(k.type).toBe('kick_off')
        for (const f of ['team', 'scorer', 'notes', 'replay', 'pen'] as const) expect(k[f]).toBeUndefined()
    })

    it('should move the existing marker when a second one of the same type is placed, in one undo step', () => {
        s().addEvent({ id: 'k1', matchTimeSec: 30, sourceFileIndex: 0, type: 'kick_off' })
        s().addEvent({ id: 'w1', matchTimeSec: 90, sourceFileIndex: 1, type: 'final_whistle' })
        s().addEvent({ id: 'k2', matchTimeSec: 40, sourceFileIndex: 0, type: 'goal' })
        s().placeMarker('k2', 'kick_off')
        expect(s().events.filter((e) => e.type === 'kick_off').map((e) => e.id)).toEqual(['k2'])
        expect(s().events.some((e) => e.id === 'w1')).toBe(true)
        s().undo()
        expect(s().events.find((e) => e.id === 'k1')?.type).toBe('kick_off')
        expect(s().events.find((e) => e.id === 'k2')?.type).toBe('goal')
    })
})

describe('kick-off migration', () => {
    const migrate = (persisted: unknown, version: number) => useAppState.persist.getOptions().migrate!(persisted, version) as Record<string, unknown>

    it('should drop the removed score-always-on setting and re-encode speed from stored data (v11)', () => {
        const out = migrate({ graphics: { cards: false, lowerThirds: true, replayTag: true, scoreBug: true }, reencodeSecPerSec: 0.7 }, 10)
        expect(out.graphics).toEqual({ cards: false, lowerThirds: true, replayTag: true, theme: 'shooot' })
        expect(out).not.toHaveProperty('reencodeSecPerSec')
    })

    it('should turn a stored match start into a Kick off event and drop the field', () => {
        const out = migrate({ events: [{ id: 'g', matchTimeSec: 700, sourceFileIndex: 1, type: 'goal' }], matchStartTimeSec: 610 }, 9)
        expect(out).not.toHaveProperty('matchStartTimeSec')
        expect(out.events).toEqual([
            { id: 'g', matchTimeSec: 700, sourceFileIndex: 1, type: 'goal' },
            expect.objectContaining({ type: 'kick_off', globalTimeSec: 610 }),
        ])
    })

    it('should place the migrated Kick off in its file when the files load', () => {
        useAppState.setState({ files: [], events: [{ id: 'k', type: 'kick_off', matchTimeSec: 610, sourceFileIndex: 0, globalTimeSec: 610 }], cumulativeOffsets: [], undoStack: [], redoStack: [] })
        expect(selectMatchStartSec(s())).toBe(610)
        s().setFiles([{ ...vf('a.mp4'), durationSec: 500 }, { ...vf('b.mp4'), durationSec: 500 }])
        expect(s().events[0]).toMatchObject({ sourceFileIndex: 1, matchTimeSec: 110, sourceFileKey: 'b.mp4' })
        expect(selectMatchStartSec(s())).toBe(610)
    })
})

describe('goal areas and replay framing', () => {
    const areas = { team1: { x: 0.04, y: 0.3, w: 0.4, h: 0.4 }, team2: { x: 0.56, y: 0.3, w: 0.4, h: 0.4 } }
    beforeEach(() => {
        useAppState.setState({
            files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 0, isPreviewMode: false,
            lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
            replayBeforeSec: 4, replayAfterSec: 1, replaySpeed: 0.5, goalAreas: null,
        })
        s().setFiles([vf('a.mp4')])
        s().addEvent({ id: 'g', matchTimeSec: 50, sourceFileIndex: 0, type: 'goal', team: 'Colours' })
    })

    it('should store goal areas clamped to the frame', () => {
        s().setGoalAreas({ team1: { x: 0.9, y: 0.3, w: 0.4, h: 0.9 }, team2: areas.team2 })
        expect(s().goalAreas?.team1).toEqual({ x: 0.6, y: 0.3, w: 0.4, h: 0.4 })
        s().setGoalAreas(null)
        expect(s().goalAreas).toBeNull()
    })

    it('should crop the preview replay to the goal the scoring team attacks', () => {
        s().setGoalAreas(areas)
        s().startPreview()
        expect(s().previewSteps.map((p) => p.crop ?? null)).toEqual([null, areas.team1]) // Colours attack the goal Whites defend
    })

    it('should swap ends after Half time and follow an event\'s own framing', () => {
        s().setGoalAreas(areas)
        s().addEvent({ id: 'h', matchTimeSec: 20, sourceFileIndex: 0, type: 'half_time' })
        s().startPreview()
        expect(s().previewSteps[1].crop).toEqual(areas.team2)
        s().exitPreview()
        s().updateEvent('g', { replayCrop: 'full' })
        s().startPreview()
        expect(s().previewSteps[1].crop).toBeUndefined()
    })

    it('should forget the goal areas for a new match (the camera moves)', () => {
        s().setGoalAreas(areas)
        s().newMatch()
        expect(s().goalAreas).toBeNull()
    })
})

describe('defaults', () => {
    it('should default the REPLAY tag on and the full-match score bug to after goals', () => {
        const initial = useAppState.getInitialState()
        expect(initial.graphics.replayTag).toBe(true)
        expect(initial.fullMatch.scoreBug).toBe('goals')
    })
})

describe('graphics theme setting', () => {
    it('should default to the Shooot look and accept classic', () => {
        s().setGraphics({ theme: 'classic' })
        expect(s().graphics.theme).toBe('classic')
        s().setGraphics({ theme: 'shooot' })
        expect(s().graphics.theme).toBe('shooot')
    })

    it('should keep the previous theme for an unknown value', () => {
        s().setGraphics({ theme: 'classic' })
        s().setGraphics({ theme: 'neon' as never })
        expect(s().graphics.theme).toBe('classic')
        s().setGraphics({ theme: 'shooot' })
    })

    it('should give saved projects without a theme the Shooot look (migration v16)', () => {
        const migrate = useAppState.persist.getOptions().migrate!
        const out = migrate({ graphics: { cards: true, lowerThirds: false, replayTag: true } }, 15) as { graphics: unknown }
        expect(out.graphics).toEqual({ cards: true, lowerThirds: false, replayTag: true, theme: 'shooot' })
    })
})

describe('suggestions', () => {
    const files = [{ id: 'f1', name: 'A.MP4', url: '', kind: 'full', durationSec: 600, file: new File([], 'A.MP4') }] as unknown as VideoSourceFile[]
    const run = { createdAt: 1, source: 'audio' as const, configVersion: 1, analysedSec: 600, total: 2 }
    beforeEach(() => { useAppState.setState({ files, cumulativeOffsets: [0], events: [], suggestions: [], suggestionRun: null, undoStack: [], redoStack: [], teams: [{ name: 'Whites', color: '#fff', roster: [] }, { name: 'Colours', color: '#000', roster: [] }] }) })

    it('should keep a suggestion as a goal two seconds before the shout, in one undo step', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const [first] = useAppState.getState().suggestions
        useAppState.getState().decideSuggestion(first.id, { kind: 'keep', type: 'goal', team: 'Whites' })
        const st = useAppState.getState()
        expect(st.events).toHaveLength(1)
        expect(st.events[0]).toMatchObject({ type: 'goal', team: 'Whites', matchTimeSec: 98, sourceFileIndex: 0 })
        expect(st.suggestions[0]).toMatchObject({ status: 'kept', keptAs: 'goal', eventId: st.events[0].id })
        expect(st.undoStack).toHaveLength(1)
    })
    it('should undo a discard with undo() (back to pending, review returns to it) without touching events', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const [a, b] = useAppState.getState().suggestions
        useAppState.getState().decideSuggestion(a.id, { kind: 'reject' })
        useAppState.getState().setReviewIndex(1)
        useAppState.getState().undo()
        const st = useAppState.getState()
        expect(st.suggestions.map((x) => x.status)).toEqual(['pending', 'pending'])
        expect(st.reviewIndex).toBe(0)
        expect(b.status).toBe('pending')
    })
    it('should fall back to the event undo once something else changed after the discard', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const [a, b] = useAppState.getState().suggestions
        useAppState.getState().decideSuggestion(a.id, { kind: 'reject' })
        useAppState.getState().decideSuggestion(b.id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().undo()
        const st = useAppState.getState()
        expect(st.events).toHaveLength(0)
        expect(st.suggestions[0].status).toBe('rejected')
    })
    it('should undo two discards in order with two undos, leaving earlier events alone', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        useAppState.getState().addEvent({ id: 'e0', matchTimeSec: 5, sourceFileIndex: 0, type: 'goal' })
        const [a, b] = useAppState.getState().suggestions
        useAppState.getState().decideSuggestion(a.id, { kind: 'reject' })
        useAppState.getState().decideSuggestion(b.id, { kind: 'reject' })
        useAppState.getState().undo()
        expect(useAppState.getState().suggestions.map((x) => x.status)).toEqual(['rejected', 'pending'])
        useAppState.getState().undo()
        expect(useAppState.getState().suggestions.map((x) => x.status)).toEqual(['pending', 'pending'])
        expect(useAppState.getState().events.map((e) => e.id)).toEqual(['e0'])
    })
    it('should undo a confirm made after a discard first, then the discard', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const [a, b] = useAppState.getState().suggestions
        useAppState.getState().decideSuggestion(a.id, { kind: 'reject' })
        useAppState.getState().decideSuggestion(b.id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().undo()
        expect(useAppState.getState().events).toHaveLength(0)
        expect(useAppState.getState().suggestions[0].status).toBe('rejected')
        useAppState.getState().undo()
        expect(useAppState.getState().suggestions[0].status).toBe('pending')
    })
    it('should keep the order right when the undo stack is full (50 entries)', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const [a, b] = useAppState.getState().suggestions
        for (let i = 0; i < 50; i++) useAppState.getState().addEvent({ id: `f${i}`, matchTimeSec: i, sourceFileIndex: 0, type: 'highlight' })
        expect(useAppState.getState().undoStack).toHaveLength(50)
        useAppState.getState().decideSuggestion(a.id, { kind: 'reject' })
        useAppState.getState().decideSuggestion(b.id, { kind: 'keep', type: 'goal', team: 'Whites' })
        expect(useAppState.getState().undoStack).toHaveLength(50)
        useAppState.getState().undo()
        expect(useAppState.getState().events.some((e) => e.type === 'goal')).toBe(false) // the confirm, not the stale discard
        expect(useAppState.getState().suggestions[0].status).toBe('rejected')
    })
    it('should bring a discarded kept card\'s event back with undoDiscard, like undo()', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        expect(useAppState.getState().events).toHaveLength(0)
        expect(useAppState.getState().undoDiscard(id)).toBe(true)
        expect(useAppState.getState().events).toHaveLength(1)
        expect(useAppState.getState().suggestions[0].status).toBe('kept')
    })
    it('should not let a stale undoDiscard or undoIfTop undo something later', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const [a, b] = useAppState.getState().suggestions
        useAppState.getState().decideSuggestion(a.id, { kind: 'reject' })
        const top = useAppState.getState().undoStack.at(-1)
        useAppState.getState().decideSuggestion(b.id, { kind: 'keep', type: 'goal', team: 'Whites' })
        expect(useAppState.getState().undoDiscard(a.id)).toBe(false)
        expect(useAppState.getState().undoIfTop(top)).toBe(false)
        expect(useAppState.getState().events).toHaveLength(1)
    })
    it('should restore a discarded suggestion to pending', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        useAppState.getState().restoreSuggestion(id)
        expect(useAppState.getState().suggestions[0]).toMatchObject({ status: 'pending' })
        expect(useAppState.getState().suggestions[0].eventId).toBeUndefined()
    })
    it('should keep the review panel open while tagging, and come back to it after another panel closes', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        useAppState.setState({ panel: 'review', picker: null })
        useAppState.getState().markEvent(50)
        expect(useAppState.getState().panel).toBe('review')
        expect(useAppState.getState().picker).not.toBeNull()
        useAppState.getState().closePicker()
        useAppState.getState().openPanel('match')
        expect(useAppState.getState().panel).toBe('match')
        useAppState.getState().closePanel()
        expect(useAppState.getState().panel).toBe('review')
        useAppState.getState().closePanel() // explicit close of the review
        expect(useAppState.getState().panel).toBeNull()
        useAppState.getState().openPanel('match'); useAppState.getState().closePanel()
        expect(useAppState.getState().panel).toBeNull() // nothing to return to
    })
    it('should return to the review after the event sheet closes, not after an explicit review close', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        useAppState.getState().addEvent({ id: 'e1', matchTimeSec: 10, sourceFileIndex: 0, type: 'goal' })
        useAppState.setState({ panel: 'review' })
        useAppState.getState().editEvent('e1')
        expect(useAppState.getState().panel).toBe('event')
        useAppState.getState().closePanel()
        expect(useAppState.getState().panel).toBe('review')
    })
    it('should link an existing event to a suggestion as kept', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().addEvent({ id: 'e1', matchTimeSec: 99, sourceFileIndex: 0, type: 'goal' })
        useAppState.getState().linkSuggestionEvent(id, 'e1')
        expect(useAppState.getState().suggestions[0]).toMatchObject({ status: 'kept', keptAs: 'goal', eventId: 'e1' })
    })
    it('should use atSec (to 0.1 s) instead of the estimate when given', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites', atSec: 97.26 })
        expect(useAppState.getState().events[0]).toMatchObject({ matchTimeSec: 97.3, sourceFileIndex: 0 })
    })
    it('should make an undone keep pending again and not duplicate on re-keep', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().undo()
        expect(useAppState.getState().events).toHaveLength(0)
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'save' })
        expect(useAppState.getState().events).toHaveLength(1)
        expect(useAppState.getState().events[0].type).toBe('save')
    })
    it('should remove the kept event when a decision changes to reject', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        expect(useAppState.getState().events).toHaveLength(0)
        expect(useAppState.getState().suggestions[0].status).toBe('rejected')
    })
    it('should keep decisions when finding goals again', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }, { timeSec: 300, score: 4 }])
        const id = useAppState.getState().suggestions[1].id
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        useAppState.getState().setSuggestions(run, [{ timeSec: 305, score: 9 }, { timeSec: 450, score: 3 }])
        expect(useAppState.getState().suggestions.map((x) => [x.globalTimeSec, x.status])).toEqual([[300, 'rejected'], [450, 'pending']])
    })
    it('should clear suggestions on new match', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        useAppState.getState().newMatch()
        expect(useAppState.getState().suggestions).toEqual([])
        expect(useAppState.getState().suggestionRun).toBeNull()
    })
    it('should migrate v16 state with empty suggestions', () => {
        const migrate = (useAppState as unknown as { persist: { getOptions: () => { migrate: (s: unknown, v: number) => Record<string, unknown> } } }).persist.getOptions().migrate
        const out = migrate({ events: [], teams: [] }, 16)
        expect(out.suggestions).toEqual([])
        expect(out.suggestionRun).toBeNull()
    })
    it('should replace a keep whose event was undone when finding goals again', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().undo()
        useAppState.getState().setSuggestions(run, [{ timeSec: 102, score: 6 }])
        const list = useAppState.getState().suggestions
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({ status: 'pending', globalTimeSec: 102 })
        expect(list[0].id).not.toBe(id)
    })
    it('should count a keep as kept again when reject is undone', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const id = useAppState.getState().suggestions[0].id
        useAppState.getState().decideSuggestion(id, { kind: 'keep', type: 'goal', team: 'Whites' })
        useAppState.getState().decideSuggestion(id, { kind: 'reject' })
        useAppState.getState().undo()
        const st = useAppState.getState()
        const ids = new Set(st.events.map((e) => e.id))
        expect(effectiveStatus(st.suggestions[0], ids)).toBe('kept')
        expect(reviewCounts(st.suggestions, ids).kept).toBe(1)
    })
    it('should keep in the second file of a two-file timeline', () => {
        const two = [files[0], { ...files[0], id: 'f2', name: 'B.MP4' }] as VideoSourceFile[]
        useAppState.setState({ files: two, cumulativeOffsets: [0, 600] })
        useAppState.getState().setSuggestions(run, [{ timeSec: 700, score: 5 }])
        useAppState.getState().decideSuggestion(useAppState.getState().suggestions[0].id, { kind: 'keep', type: 'goal', team: 'Whites' })
        expect(useAppState.getState().events[0]).toMatchObject({ sourceFileIndex: 1, matchTimeSec: 98 })
    })
    it('should reset suggestions on clear', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        useAppState.getState().clear()
        expect(useAppState.getState().suggestions).toEqual([])
        expect(useAppState.getState().suggestionRun).toBeNull()
    })
    it('should persist suggestions but not the review index', () => {
        useAppState.getState().setSuggestions(run, [{ timeSec: 100, score: 5 }])
        const partialize = (useAppState as unknown as { persist: { getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } } }).persist.getOptions().partialize
        const out = partialize(useAppState.getState())
        expect(out).toHaveProperty('suggestions')
        expect(out).toHaveProperty('suggestionRun')
        expect(out).not.toHaveProperty('reviewIndex')
    })
})

describe('goal marks', () => {
    const MARKS: GoalMarks = {
        postL: { x: 0.27, y: 0.25 }, postR: { x: 0.32, y: 0.235 },
        barL: { x: 0.265, y: 0.217 }, barR: { x: 0.315, y: 0.207 },
    }
    beforeEach(() => { useAppState.setState({ goalMarks: null, goalAreas: null }) })

    it('should store marks and set the rectangle from them', () => {
        s().setGoalMarks('team1', MARKS)
        expect(s().goalMarks!.team1).toEqual(MARKS)
        expect(s().goalAreas!.team1).toEqual(goalRectFromMarks(MARKS))
    })

    it('should round stored mark coordinates to 4 decimals', () => {
        s().setGoalMarks('team1', { ...MARKS, postL: { x: 0.123456789, y: 0.98765432 } })
        expect(s().goalMarks!.team1!.postL).toEqual({ x: 0.1235, y: 0.9877 })
    })

    it('should remove marks but keep the rectangle', () => {
        s().setGoalMarks('team1', MARKS)
        s().setGoalMarks('team1', null)
        expect(s().goalMarks).toBeNull()
        expect(s().goalAreas!.team1).toEqual(goalRectFromMarks(MARKS))
    })

    it('should keep the other team rectangle when marking one goal', () => {
        s().setGoalMarks('team1', MARKS)
        const other = { x: 0.55, y: 0.3, w: 0.3, h: 0.3 }
        s().setGoalAreas({ ...s().goalAreas!, team2: other })
        s().setGoalMarks('team1', { ...MARKS, postR: { x: 0.34, y: 0.235 } })
        expect(s().goalAreas!.team2).toEqual(other)
    })

    it('should never move an existing replay box when the marks are saved or changed', () => {
        const tuned = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }
        useAppState.setState({ goalAreas: { team1: tuned } })
        s().setGoalMarks('team1', MARKS)
        expect(s().goalAreas!.team1).toEqual(tuned)
        s().setGoalMarks('team1', { ...MARKS, postR: { x: 0.34, y: 0.235 } })
        expect(s().goalAreas!.team1).toEqual(tuned)
        s().setGoalMarks('team1', null)
        expect(s().goalAreas!.team1).toEqual(tuned)
    })

    it('should keep the marks when the rectangle is dragged', () => {
        s().setGoalMarks('team1', MARKS)
        s().setGoalAreas({ team1: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } })
        expect(s().goalMarks!.team1).toEqual(MARKS)
    })

    it('should reset on newMatch and clear', () => {
        s().setGoalMarks('team1', MARKS)
        s().clear()
        expect(s().goalMarks).toBeNull()
        s().setGoalMarks('team2', MARKS)
        s().newMatch()
        expect(s().goalMarks).toBeNull()
    })

    it('should replace all marks with setAllGoalMarks', () => {
        s().setAllGoalMarks({ team2: MARKS })
        expect(s().goalMarks).toEqual({ team2: MARKS })
        s().setAllGoalMarks(null)
        expect(s().goalMarks).toBeNull()
    })

    it('should migrate from v17 to null marks, keep valid ones, and persist them', () => {
        const opts = useAppState.persist.getOptions()
        expect((opts.migrate!({}, 17) as { goalMarks: unknown }).goalMarks).toBeNull()
        expect((opts.migrate!({ goalMarks: { team1: MARKS, team2: 'junk' } }, 17) as { goalMarks: unknown }).goalMarks).toEqual({ team1: MARKS })
        const out = opts.migrate!({ adjustTimestampsByOffset: true, goalMarks: { team1: MARKS } }, 17) as Record<string, unknown>
        expect('adjustTimestampsByOffset' in out).toBe(false) // v18
        expect(out.goalMarks).toEqual({ team1: MARKS }) // v19
        s().setGoalMarks('team1', MARKS)
        expect(opts.partialize!(s())).toHaveProperty('goalMarks')
    })
})

describe('labsSeen', () => {
    it('should remember that Labs was on, default false and persist it', () => {
        const opts = (useAppState as unknown as { persist: { getOptions: () => { partialize?: (s: unknown) => unknown } } }).persist.getOptions()
        useAppState.setState({ labs: false, labsSeen: false })
        useAppState.getState().setLabs(false)
        expect(useAppState.getState().labsSeen).toBe(false)
        useAppState.getState().setLabs(true)
        useAppState.getState().setLabs(false)
        expect(useAppState.getState()).toMatchObject({ labs: false, labsSeen: true })
        expect(opts.partialize!(useAppState.getState())).toHaveProperty('labsSeen', true)
    })
    it('should count an already-on Labs as seen when it is switched off', () => {
        useAppState.setState({ labs: true, labsSeen: false })
        useAppState.getState().setLabs(false)
        expect(useAppState.getState().labsSeen).toBe(true)
    })
})

describe('labs and ball tags', () => {
    it('should default labs off, set it, persist it and migrate older state to a boolean (v20)', () => {
        const opts = useAppState.persist.getOptions()
        expect(s().labs).toBe(false)
        s().setLabs(true)
        expect(s().labs).toBe(true)
        expect(opts.partialize!(s())).toHaveProperty('labs', true)
        s().setLabs(false)
        expect((opts.migrate!({}, 19) as { labs: boolean }).labs).toBe(false)
        expect((opts.migrate!({ labs: true }, 19) as { labs: boolean }).labs).toBe(true)
        expect((opts.migrate!({ labs: 'x' }, 19) as { labs: boolean }).labs).toBe(false)
    })

    it('should set and clear a ball tag on one suggestion', () => {
        const base = { globalTimeSec: 1, score: 1, source: 'audio' as const, status: 'pending' as const }
        useAppState.setState({ suggestions: [{ id: 'a', ...base }, { id: 'b', ...base }] })
        s().setSuggestionBall('a', { goal: 'team2', frames: 3 })
        expect(s().suggestions[0].ball).toEqual({ goal: 'team2', frames: 3 })
        expect(s().suggestions[1].ball).toBeUndefined()
        s().setSuggestionBall('a', null)
        expect(s().suggestions[0].ball).toBeUndefined()
        useAppState.setState({ suggestions: [] })
    })
})

describe('setMarkerAt', () => {
    beforeEach(() => {
        useAppState.setState({ files: [], events: [], cumulativeOffsets: [], undoStack: [], redoStack: [], currentFileIndex: 0 })
        s().setFiles([vf('a.mp4'), vf('b.mp4')])
    })
    it('should place a single marker, move it, and undo in one step', () => {
        s().setMarkerAt('kick_off', 0, 20.7)
        s().setMarkerAt('kick_off', 1, 5)
        const ko = s().events.filter((e) => e.type === 'kick_off')
        expect(ko).toHaveLength(1)
        expect(ko[0]).toMatchObject({ sourceFileIndex: 1, matchTimeSec: 5 })
        s().undo()
        expect(s().events.filter((e) => e.type === 'kick_off')[0]).toMatchObject({ sourceFileIndex: 0, matchTimeSec: 20 })
    })
})
