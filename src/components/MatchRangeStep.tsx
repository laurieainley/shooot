import { useEffect, useRef, useState } from 'react'
import { selectClockLong, useAppState } from '../state'
import { startDetection } from '../detectJobs'
import { finalWhistleSec, markerGlobalSec } from '../utils/matchClock'
import { globalToFileTime } from '../utils/matchStrip'
import { formatClock } from '../utils/timeline'
import { seekPlayerPaused, togglePlayerPlayback } from './playerControl'
import { rangeIsValid, setRangeStep } from './findGoals'

type Marker = 'kick_off' | 'final_whistle'

const start = (ball: boolean, wholeVideo = false): void => { setRangeStep(false); startDetection({ ...(wholeVideo ? { wholeVideo } : {}), ball }) }

/** Tags a marker at the playhead (file + time). */
function tagHere(type: Marker): void {
    const st = useAppState.getState()
    st.setMarkerAt(type, st.currentFileIndex, st.currentTimeInFileSec)
}

/** Seeks the (paused) player by a number of seconds on the whole timeline. */
function seekBy(deltaSec: number): void {
    const st = useAppState.getState()
    const durations = st.files.map((f) => f.durationSec ?? 0)
    const total = durations.reduce((a, b) => a + b, 0)
    const now = (st.cumulativeOffsets[st.currentFileIndex] ?? 0) + st.currentTimeInFileSec
    const at = globalToFileTime(st.cumulativeOffsets, durations, Math.min(total, Math.max(0, now + deltaSec)))
    seekPlayerPaused(at.fileIndex, at.timeSec)
}

/** Start form of Find goals: where the match starts and ends (so warm-up and post-match footage is left out) and, with Labs, Advanced detection. */
export function MatchRangeStep() {
    const events = useAppState((s) => s.events)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const long = useAppState(selectClockLong)
    const ko = markerGlobalSec(events, offsets, 'kick_off')
    const fw = markerGlobalSec(events, offsets, 'final_whistle')
    const valid = rangeIsValid(events, offsets)
    const labs = useAppState((s) => s.labs)
    const hasMarks = useAppState((s) => !!(s.goalMarks?.team1 || s.goalMarks?.team2))
    const hasSuggestions = useAppState((s) => s.suggestions.length > 0)
    // Ticked by default once a goal is marked; the choice is for this run only (never persisted).
    const [choice, setChoice] = useState<boolean | null>(null)
    const ball = labs && hasMarks && (choice ?? true)
    const ballRef = useRef(ball)
    ballRef.current = ball
    const outOfOrder = ko !== null && fw !== null && !(finalWhistleSec(events, offsets)! > ko)

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const target = e.target as HTMLElement | null
            if (target?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
            const button = target?.closest?.('button') ?? null
            const k = e.key.toLowerCase()
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault()
                seekBy((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 5))
                return
            }
            if (e.shiftKey || e.repeat) return
            if (e.key === ' ' && !button) { e.preventDefault(); togglePlayerPlayback(); return }
            if (k === 'k') { e.preventDefault(); tagHere('kick_off'); return }
            if (k === 'w') { e.preventDefault(); tagHere('final_whistle'); return }
            if (e.key === 'Enter') {
                if (button) return // a focused button acts on Enter itself
                const st = useAppState.getState()
                if (rangeIsValid(st.events, st.cumulativeOffsets)) { e.preventDefault(); start(ballRef.current) }
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const row = (label: string, at: number | null, type: Marker, here: string, key: string) => (
        <div className="range__row">
            <p className="range__label m-0">{label}: <span className="tc">{at === null ? 'not set' : formatClock(at, long)}</span></p>
            <button type="button" className="btn-quiet review__btn" onClick={() => tagHere(type)}>{here} <kbd>{key}</kbd></button>
        </div>
    )

    return (
        <div className="range review__status">
            <p className="m-0">First, set where the match starts and ends.</p>
            <p className="review__note m-0">Scrub to the first kick, then to the final whistle.</p>
            {row('Kick off', ko, 'kick_off', 'Kick off is here', 'K')}
            {row('Final whistle', fw, 'final_whistle', 'Final whistle is here', 'W')}
            {labs && (
                <div className="range__adv">
                    <label className="range__tick">
                        <input type="checkbox" checked={ball} disabled={!hasMarks} onChange={(e) => setChoice(e.target.checked)} />
                        <span><strong>Advanced detection</strong><span className="review__note range__advnote"> Also look for the ball in the goal mouths. Slower: about 10 minutes for an hour of 4K.</span></span>
                    </label>
                    {!hasMarks && (
                        <>
                            <p className="review__note m-0">Mark the goals in Match setup first.</p>
                            <button type="button" className="btn-quiet review__btn" onClick={() => useAppState.getState().openPanel('match')}>Open Match setup</button>
                        </>
                    )}
                </div>
            )}
            {outOfOrder && <p className="m-0" role="alert">The final whistle must be after kick off.</p>}
            <button type="button" className="btn-primary review__btn" disabled={!valid} onClick={() => start(ball)}>Find goals <kbd>⏎</kbd></button>
            <button type="button" className="btn-quiet review__btn" onClick={() => start(ball, true)}>Skip — use the whole video</button>
            {hasSuggestions && <button type="button" className="btn-quiet review__btn" onClick={() => setRangeStep(false)}>Cancel</button>}
        </div>
    )
}
