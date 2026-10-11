import { useEffect } from 'react'
import { selectClockLong, useAppState } from '../state'
import { startDetection } from '../detectJobs'
import { finalWhistleSec, markerGlobalSec } from '../utils/matchClock'
import { globalToFileTime } from '../utils/matchStrip'
import { formatClock } from '../utils/timeline'
import { seekPlayerPaused, togglePlayerPlayback } from './playerControl'
import { rangeIsValid, setRangeStep } from './findGoals'

type Marker = 'kick_off' | 'final_whistle'

const start = (wholeVideo = false): void => { setRangeStep(false); startDetection(wholeVideo ? { wholeVideo } : undefined) }

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

/** First step of Find goals: where the match starts and ends, so warm-up and post-match footage is left out. */
export function MatchRangeStep() {
    const events = useAppState((s) => s.events)
    const offsets = useAppState((s) => s.cumulativeOffsets)
    const long = useAppState(selectClockLong)
    const ko = markerGlobalSec(events, offsets, 'kick_off')
    const fw = markerGlobalSec(events, offsets, 'final_whistle')
    const valid = rangeIsValid(events, offsets)
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
                if (rangeIsValid(st.events, st.cumulativeOffsets)) { e.preventDefault(); start() }
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
            {outOfOrder && <p className="m-0" role="alert">The final whistle must be after kick off.</p>}
            <button type="button" className="btn-primary review__btn" disabled={!valid} onClick={() => start()}>Find goals <kbd>⏎</kbd></button>
            <button type="button" className="btn-quiet review__btn" onClick={() => start(true)}>Skip — use the whole video</button>
        </div>
    )
}
