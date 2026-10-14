import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAppState } from '../../state'
import type { CropRect, GoalMarks, GoalTeam } from '../../types'
import { teamGoalLabel } from '../../utils/attack'
import { defaultGoalAreas } from '../../utils/crop'
import { goalRectFromMarks } from '../../utils/goalMarks'
import { MARK_STEPS, isComplete, nextStep, promptFor, type MarkKey } from '../../utils/goalMarkSteps'
import { CloseButton } from '../CloseButton'
import { GoalSetupSummary } from '../GoalSetupSummary'
import { COARSE_QUERY, TABLET_QUERY, useMediaQuery } from '../useMediaQuery'
import { GoalDiagram } from './GoalDiagram'
import { PostPlacer, type PostPlacerHandle } from './PostPlacer'
import { STEP_ORDER, type SetupStep } from './steps'
import { useGoalPicture, useThumbnails } from './useGoalPicture'
import { ZoomFramer } from './ZoomFramer'

interface GoalSetupProps {
    /** The step to open at (default: choose the picture). */
    startAt?: SetupStep
    /** Edit just that step, then show the summary (instead of carrying on through the later steps). */
    only?: boolean
    onClose: () => void
}

const FRAME_STEP_SEC = 5
const HINT_KEY = 'shooot-goal-setup-rotate-hint'
const PHONE_PORTRAIT_QUERY = '(pointer: coarse) and (orientation: portrait) and (max-width: 599px)'
const NONE_SKIPPED: ReadonlySet<MarkKey> = new Set<MarkKey>()
const ZOOM_INSTRUCTION = 'Goal replays at this end zoom to this view. To frame one goal more exactly, use Framing on its row in the events list.'
const DOTS: SetupStep[] = ['posts1', 'posts2', 'zoom1', 'zoom2']
const TEAM_OF: Partial<Record<SetupStep, GoalTeam>> = { posts1: 'team1', zoom1: 'team1', posts2: 'team2', zoom2: 'team2' }

const clock = (sec: number): string => {
    const t = Math.max(0, Math.round(sec))
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
const readHint = (): boolean => { try { return localStorage.getItem(HINT_KEY) === '1' } catch { return false } }
const writeHint = (): void => { try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode: the hint just comes back */ } }

let openLayers = 0

/**
 * The guided, full-screen goal set-up: choose the picture, identify each goal's posts, set each goal's replay zoom with
 * the replay view itself, then check the summary. Esc, the ✕ and the phone's Back button close it; whatever was
 * finished is already saved.
 */
export function GoalSetup({ startAt = 'picture', only = false, onClose }: GoalSetupProps) {
    const teams = useAppState((s) => s.teams)
    const first = useAppState((s) => s.files[0])
    const marks = useAppState((s) => s.goalMarks)
    const areas = useAppState((s) => s.goalAreas)
    const setMarks = useAppState((s) => s.setGoalMarks)
    const setAreas = useAppState((s) => s.setGoalAreas)
    const touch = useMediaQuery(COARSE_QUERY)
    const tablet = useMediaQuery(TABLET_QUERY)
    const phonePortrait = useMediaQuery(PHONE_PORTRAIT_QUERY)
    const duration = first?.durationSec || 0

    const [step, setStep] = useState<SetupStep>(startAt)
    // Editing one step from the summary returns to the summary.
    const [solo, setSolo] = useState(only)
    const [time, setTime] = useState(Math.min(duration / 2, duration))
    const [drafts, setDrafts] = useState<Partial<Record<GoalTeam, Partial<GoalMarks>>>>(() => ({ team1: marks?.team1, team2: marks?.team2 }))
    const [rects, setRects] = useState<Partial<Record<GoalTeam, CropRect>>>({})
    const [hintGone, setHintGone] = useState(readHint)
    const root = useRef<HTMLDivElement | null>(null)
    const placer = useRef<PostPlacerHandle | null>(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    const sharp = step !== 'picture'
    const picture = useGoalPicture(first?.url, duration, time, sharp)
    const thumbs = useThumbnails(first?.url, duration, step === 'picture')

    // Focus the layer, give focus back on close; the phone's Back button is a history entry.
    useEffect(() => {
        const previous = document.activeElement
        root.current?.focus({ preventScroll: true })
        openLayers += 1
        if (!(history.state as { goalSetup?: boolean } | null)?.goalSetup) history.pushState({ ...(history.state as object | null), goalSetup: true }, '')
        const onPop = (): void => { if (!(history.state as { goalSetup?: boolean } | null)?.goalSetup) closeRef.current() }
        window.addEventListener('popstate', onPop)
        return () => {
            window.removeEventListener('popstate', onPop)
            openLayers -= 1
            // Deferred so a Strict Mode re-mount keeps the entry.
            setTimeout(() => { if (openLayers === 0 && (history.state as { goalSetup?: boolean } | null)?.goalSetup) history.back() }, 0)
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
        }
    }, [])

    // A button that ends the step unmounts under the user's finger: keep focus in the layer so Esc still works.
    useEffect(() => { root.current?.focus({ preventScroll: true }) }, [step])

    const team = TEAM_OF[step]
    const label = team ? teamGoalLabel(teams, team) : ''
    const partial: Partial<GoalMarks> = (team && drafts[team]) || {}
    const current = step === 'posts1' || step === 'posts2' ? nextStep(partial, NONE_SKIPPED) : null
    const other = team ? marks?.[team === 'team1' ? 'team2' : 'team1'] ?? null : null

    const go = (to: SetupStep): void => setStep(to)
    const after = (done: SetupStep): void => {
        if (solo || done === 'summary') return go('summary')
        const i = STEP_ORDER.indexOf(done)
        go(STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)])
    }
    const back = (): void => {
        const i = STEP_ORDER.indexOf(step)
        go(solo || i <= 0 ? 'summary' : STEP_ORDER[i - 1])
    }
    const setPartial = (t: GoalTeam, m: Partial<GoalMarks>): void => setDrafts((d) => ({ ...d, [t]: m }))
    const undo = (): void => {
        if (!team) return
        const last = [...MARK_STEPS].reverse().find((s) => partial[s.key])
        if (!last) return
        const rest = { ...partial }
        delete rest[last.key]
        setPartial(team, rest)
    }
    const saveMarks = (): void => {
        if (!team || !isComplete(partial)) return
        const { postL, postR, barL, barR, backL, backR } = partial
        setMarks(team, backL && backR ? { postL, postR, barL, barR, backL, backR } : { postL, postR, barL, barR })
        after(step)
    }

    const homeRect = (t: GoalTeam): CropRect => (marks?.[t] ? goalRectFromMarks(marks[t]!) : defaultGoalAreas()[t]!)
    const rectFor = (t: GoalTeam): CropRect => rects[t] ?? areas?.[t] ?? homeRect(t)
    const onRect = useCallback((t: GoalTeam, r: CropRect) => setRects((s) => ({ ...s, [t]: r })), [])
    const saveZoom = (): void => {
        if (!team) return
        setAreas({ ...areas, [team]: rectFor(team) })
        after(step)
    }

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
        const t = e.target as HTMLElement
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
        if (e.key === 'Backspace' && (step === 'posts1' || step === 'posts2') && !t.closest('input, textarea')) { e.preventDefault(); undo() }
    }

    const titles: Record<SetupStep, [string, string]> = {
        picture: ['Choose the picture', 'Find a moment where both goals are clear.'],
        posts1: [`Identify goal posts — ${label}`, ''],
        posts2: [`Identify goal posts — ${label}`, ''],
        zoom1: [`Replay zoom — goals scored into ${label}`, ZOOM_INSTRUCTION],
        zoom2: [`Replay zoom — goals scored into ${label}`, ZOOM_INSTRUCTION],
        summary: ['Goal set-up', 'Check each goal, or edit one.'],
    }
    const [title, instruction] = titles[step]
    const teamName = team ? teams[team === 'team1' ? 0 : 1]?.name.trim() || (team === 'team1' ? 'Team 1' : 'Team 2') : ''
    const goalNote = team && step !== 'picture' && step !== 'summary' ? `${label}: the end ${teamName} defend at kick-off.` : ''
    const dot = DOTS.indexOf(step)
    const posts = step === 'posts1' || step === 'posts2'
    const frame = picture.frame
    const at = current ? MARK_STEPS.findIndex((s) => s.key === current) : -1
    const pointNo = `${at + 1} of ${MARK_STEPS.length}`
    const pointPrompt = current
        ? (touch ? `Move the picture until the crosshair is on ${MARK_STEPS.find((s) => s.key === current)!.prompt}, then press Set point.` : promptFor(current, false))
        : null

    const placed = MARK_STEPS.filter((s) => partial[s.key]).length
    const complete = isComplete(partial)

    return createPortal(
        <div ref={root} className={`gs gs--${step}`} role="dialog" aria-modal="true" aria-label="Goal set-up" tabIndex={-1} data-owns-escape onKeyDown={onKeyDown}>
            <header className="gs-head">
                {step !== 'picture' && step !== 'summary' && (
                    <ol className="gs-dots" aria-label={`Step ${dot + 1} of ${DOTS.length}`}>
                        {DOTS.map((d, i) => <li key={d} className={i === dot ? 'gs-dots__dot gs-dots__dot--now' : i < dot ? 'gs-dots__dot gs-dots__dot--done' : 'gs-dots__dot'} />)}
                    </ol>
                )}
                <div className="gs-head__top">
                    <h2 className="gs-title">{title}</h2>
                    <CloseButton onClick={onClose} label="Close goal set-up" />
                </div>
                {goalNote && <p className="gs-note gs-note--goal">{goalNote}</p>}
                {instruction && <p className="gs-instruction">{instruction}</p>}
                {posts && (
                    <div className="gs-head__point">
                        <GoalDiagram current={current} placed={partial} />
                        {pointPrompt && <p className="gs-prompt" role="status">{`${pointNo} · `}{pointPrompt}</p>}
                        {!touch && <p className="gs-note">Scroll to zoom. Right-drag, or hold Space and drag, to move the picture.</p>}
                    </div>
                )}
            </header>

            <div className="gs-stage">
                {step === 'picture' && (frame
                    ? <img className="gs-still" src={frame.src} alt="The picture goals will be set on" draggable={false} data-loading={picture.status === 'loading' || undefined} />
                    : <p className="gs-empty" role="status">{picture.status === 'loading' ? 'Loading a frame…' : 'No picture available for this video here.'}</p>)}
                {posts && team && (
                    <PostPlacer
                        key={team}
                        ref={placer}
                        frame={frame}
                        loading={picture.status === 'loading'}
                        team={team}
                        marks={partial}
                        current={current}
                        other={other}
                        touch={touch}
                        startZoom={tablet ? 2 : 3}
                        onMarksChange={(m) => setPartial(team, m)}
                    />
                )}
                {posts && phonePortrait && !hintGone && (
                            <p className="gs-hint gs-hint--over">
                                <span>Turn sideways for a bigger picture</span>
                                <button type="button" className="btn-text" onClick={() => { writeHint(); setHintGone(true) }}>Got it</button>
                            </p>
                        )}
                {(step === 'zoom1' || step === 'zoom2') && team && (
                    <ZoomFramer key={team} frame={frame} rect={rectFor(team)} home={homeRect(team)} onChange={(r) => onRect(team, r)} />
                )}
                {step === 'summary' && (
                    <div className="gs-stage__scroll">
                        <GoalSetupSummary frame={frame} onEdit={(s) => { setSolo(true); go(s) }} onSetup={() => go('posts1')} />
                    </div>
                )}
            </div>

            <div className="gs-controls">
                {step === 'picture' && (
                    <>
                        {thumbs.length > 0 && (
                            <div className="gs-thumbs" role="group" aria-label="Frames to choose from">
                                {thumbs.map((t) => (
                                    <button
                                        key={t.time}
                                        type="button"
                                        className="gs-thumb"
                                        aria-label={`Frame at ${clock(t.time)}`}
                                        aria-pressed={Math.round(t.time) === Math.round(time)}
                                        disabled={!t.frame}
                                        onClick={() => setTime(Math.round(t.time))}
                                    >
                                        {t.frame ? <img src={t.frame.src} alt="" draggable={false} /> : <span className="gs-thumb__wait" />}
                                        <span className="gs-thumb__time tc">{clock(t.time)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {duration > 0 && (
                            <div className="gs-scrub" role="group" aria-label="Frame">
                                <button type="button" className="gs-iconbtn" aria-label="Earlier frame" title={`Back ${FRAME_STEP_SEC} s`} disabled={time <= 0} onClick={() => setTime(Math.max(0, time - FRAME_STEP_SEC))}>
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                                </button>
                                <input type="range" className="gs-slider" aria-label="Moment in the video" min={0} max={Math.floor(duration)} step={1} value={Math.min(Math.round(time), Math.floor(duration))} aria-valuetext={clock(time)} onChange={(e) => setTime(Number(e.target.value))} />
                                <button type="button" className="gs-iconbtn" aria-label="Later frame" title={`Forward ${FRAME_STEP_SEC} s`} disabled={time >= duration} onClick={() => setTime(Math.min(Math.floor(duration), time + FRAME_STEP_SEC))}>
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                                </button>
                                <span className="gs-scrub__time tc" aria-hidden="true">{clock(time)}</span>
                            </div>
                        )}
                        <div className="gs-actions">
                            <button type="button" className="btn-primary" disabled={!frame} onClick={() => go('posts1')}>Next</button>
                            {solo && <button type="button" className="btn-quiet" onClick={back}>Back</button>}
                        </div>
                    </>
                )}
                {posts && team && (
                    <>
                        {complete && current && <p className="gs-note">Back corners are optional: press Next to skip them.</p>}
                        {complete && !current && <p className="gs-note">All six points set. Drag or nudge a dot if one is off.</p>}
                        <div className="gs-actions">
                            {touch && current
                                ? <button type="button" className="btn-primary" disabled={!frame} onClick={() => placer.current?.setPoint()}>Set point</button>
                                : <button type="button" className="btn-primary" disabled={!complete} onClick={saveMarks}>Next</button>}
                            {touch && current && complete && <button type="button" className="btn-quiet" onClick={saveMarks}>Next</button>}
                            {!complete && !touch && <span className="gs-actions__fill" />}
                            <button type="button" className="btn-quiet" disabled={placed === 0} onClick={undo}>Undo</button>
                        </div>
                        <div className="gs-actions gs-actions--quiet">
                            <button type="button" className="btn-text" onClick={back}>Back</button>
                            <button type="button" className="btn-text" onClick={() => after(step)}>Skip this goal</button>
                        </div>
                    </>
                )}
                {(step === 'zoom1' || step === 'zoom2') && team && (
                    <div className="gs-actions">
                        <button type="button" className="btn-primary" disabled={!frame} onClick={saveZoom}>Next</button>
                        <button type="button" className="btn-text" onClick={back}>Back</button>
                        <button type="button" className="btn-text" onClick={() => after(step)}>Skip</button>
                    </div>
                )}
                {step === 'summary' && (
                    <div className="gs-actions">
                        <button type="button" className="btn-primary" onClick={onClose}>Done</button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    )
}
