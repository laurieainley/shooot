import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppState } from '../state'
import type { CropRect, MatchEvent, ReplayCrop } from '../types'
import { replayCropResolver } from '../utils/attack'
import { FULL_FRAME, MAX_REPLAY_ZOOM, clampRect, isSoft, zoomOf, zoomRect } from '../utils/crop'
import { FrameBoxes, type FrameBox } from './FrameBoxes'
import { useFrameAt } from './frameGrab'

interface ReplayFramingProps {
    event: MatchEvent
}

const CHOICES: { id: 'auto' | 'left' | 'right' | 'full' | 'custom'; label: string }[] = [
    { id: 'auto', label: 'Auto' }, { id: 'left', label: 'Left goal' }, { id: 'right', label: 'Right goal' },
    { id: 'full', label: 'Full frame' }, { id: 'custom', label: 'Custom' },
]

const choiceOf = (c: ReplayCrop | undefined): (typeof CHOICES)[number]['id'] => (c === undefined ? 'auto' : typeof c === 'object' ? 'custom' : c)

/**
 * Edit sheet, replay on: how the slow-mo replay is framed. Auto = the scoring team's attacking goal (Match setup);
 * Left / Right goal, the whole frame, or a custom box drawn on the event's own frame, with zoom 1-3× around its centre.
 */
export function ReplayFraming({ event: e }: ReplayFramingProps) {
    const areas = useAppState((s) => s.goalAreas)
    const resolverState = useAppState((s) => ({ events: s.events, teams: s.teams, cumulativeOffsets: s.cumulativeOffsets, whitesAttackLeft: s.whitesAttackLeft, areas: s.goalAreas }))
    const file = useAppState((s) => s.files[e.sourceFileIndex ?? 0])
    const frame = useFrameAt(e.unlinked ? null : file?.url, e.unlinked || !file ? null : e.matchTimeSec)
    const resolved = useMemo(() => replayCropResolver(resolverState)(e), [resolverState, e])
    const choice = choiceOf(e.replayCrop)
    // A drag or slider move is a draft until it is released: one undo step per edit, not one per pixel.
    const [draft, setDraftState] = useState<CropRect | null>(null)
    const draftRef = useRef<CropRect | null>(null)
    const setDraft = (r: CropRect | null): void => { draftRef.current = r; setDraftState(r) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => setDraft(null), [e.replayCrop, e.id])
    const shown = draft ?? resolved ?? null
    const set = (crop: ReplayCrop | undefined): void => useAppState.getState().updateEvent(e.id, { replayCrop: crop })
    const commit = (): void => {
        const rect = draftRef.current
        if (!rect) return
        setDraft(null)
        set(rect.w >= 1 - 1e-6 ? 'full' : clampRect(rect))
    }
    const zoom = shown ? Math.min(MAX_REPLAY_ZOOM, zoomOf(shown)) : 1
    const boxes: FrameBox[] = shown ? [{ id: 'crop', label: 'Replay framing', short: 'Replay', rect: shown, tone: 'event' }] : []
    const needsAreas = (id: string): boolean => (id === 'left' || id === 'right') && !areas

    return (
        <fieldset className="event-sheet__group replay-framing">
            <legend>Replay framing</legend>
            <div className="chips">
                {CHOICES.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        className="chip"
                        aria-pressed={choice === c.id}
                        disabled={needsAreas(c.id)}
                        onClick={() => {
                            if (c.id === 'auto') set(undefined)
                            else if (c.id === 'custom') set(clampRect(resolved ?? { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }))
                            else set(c.id)
                        }}
                    >{c.label}</button>
                ))}
            </div>
            {!areas && <p className="goal-areas__hint">Mark the goals in Match setup to zoom to them automatically.</p>}
            <FrameBoxes
                state={frame}
                boxes={boxes}
                onChange={(_, rect) => setDraft(rect)}
                onCommit={commit}
                emptyText={e.unlinked ? 'This clip’s video is not loaded.' : 'No picture available here.'}
            />
            <label className="replay-framing__zoom">
                <span>Zoom {zoom.toFixed(1)}×</span>
                <input
                    type="range"
                    aria-label="Replay zoom"
                    min={1}
                    max={MAX_REPLAY_ZOOM}
                    step={0.1}
                    value={zoom}
                    onChange={(ev) => setDraft(zoomRect(shown ?? FULL_FRAME, Number(ev.target.value)))}
                    onPointerUp={() => commit()}
                    onKeyUp={() => commit()}
                    onBlur={() => commit()}
                />
            </label>
            {shown && isSoft(shown) && <p className="replay-framing__warn" role="status">Zoomed in tightly: the replay will look soft on 1080p footage.</p>}
        </fieldset>
    )
}
