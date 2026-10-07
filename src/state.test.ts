import { describe, it, expect, beforeEach } from 'vitest'
import { matchdayText, selectMatchStartSec, useAppState } from './state'
import type { MatchEvent, VideoSourceFile } from './types'

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
        expect(s().picker).toEqual({ eventId: e.id })
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
            expect(s().picker).toEqual({ eventId: picker.eventId })
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

    it('should migrate v8 legacy event types and persist teams (v9+)', () => {
        const opts = useAppState.persist.getOptions()
        expect(opts.version).toBe(15)
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

    it('should switch on full-match event captions once (v15)', () => {
        const migrate = useAppState.persist.getOptions().migrate!
        const out = migrate({ fullMatch: { cards: true, scoreBug: 'off', intervalMin: 5, captions: false } }, 14) as { fullMatch: { captions: boolean } }
        expect(out.fullMatch.captions).toBe(true)
        expect((migrate({ fullMatch: { cards: true, scoreBug: 'off', intervalMin: 5, captions: false } }, 15) as { fullMatch: { captions: boolean } }).fullMatch.captions).toBe(false)
    })

    it('should switch on the replay tag and set the full-match score bug to after goals once (v13)', () => {
        const migrate = useAppState.persist.getOptions().migrate!
        const out = migrate({ graphics: { cards: true, lowerThirds: true, replayTag: false }, fullMatch: { cards: false, scoreBug: 'periodic', intervalMin: 7 } }, 12) as { graphics: { replayTag: boolean }; fullMatch: unknown }
        expect(out.graphics.replayTag).toBe(true)
        expect(out.fullMatch).toEqual({ cards: false, scoreBug: 'goals', intervalMin: 7, captions: true })
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
            adjustTimestampsByOffset: false, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
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
        useAppState.setState({ graphics: { cards: true, lowerThirds: true, replayTag: false }, matchdayLabel: null })
    })

    it('should default to cards and lower thirds on, replay tag off', () => {
        expect(s().graphics).toEqual({ cards: true, lowerThirds: true, replayTag: false })
    })

    it('should ignore a legacy score-always-on field when graphics are set', () => {
        s().setGraphics({ cards: false, scoreBug: true } as never)
        expect(s().graphics).toEqual({ cards: false, lowerThirds: true, replayTag: false })
    })

    it('should toggle one graphic at a time', () => {
        s().setGraphics({ replayTag: true })
        s().setGraphics({ cards: false })
        expect(s().graphics).toEqual({ cards: false, lowerThirds: true, replayTag: true })
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
        expect(out.graphics).toEqual({ cards: false, lowerThirds: true, replayTag: true })
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
            adjustTimestampsByOffset: false, lengthBeforeGoalSec: 10, lengthAfterGoalSec: 4,
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
