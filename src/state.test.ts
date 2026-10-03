import { describe, it, expect, beforeEach } from 'vitest'
import { useAppState } from './state'
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

    it('should migrate v8 legacy event types and persist teams (v9)', () => {
        const opts = useAppState.persist.getOptions()
        expect(opts.version).toBe(9)
        const migrated = opts.migrate!({ events: [{ id: 'a', matchTimeSec: 1, type: 'moment' }, { id: 'b', matchTimeSec: 2, type: 'card' }] }, 8) as { events: MatchEvent[] }
        expect(migrated.events.map((e) => e.type)).toEqual(['highlight', 'foul'])
        expect(opts.partialize!(s())).toHaveProperty('teams')
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
