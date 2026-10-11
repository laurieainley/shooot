import { useEffect, useRef, useState } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { KeepType, Suggestion } from '../types'
import { formatClock } from '../utils/timeline'
import { isPlayerPaused, stepPlayer, togglePlayerPlayback, usePlayerPaused } from './playerControl'
import { AUDIO_DETECT } from '../detect/detectConfig'
import { formatReviewWindow, withTenths } from '../utils/reviewLoop'
import { useReviewLoop } from './useReviewLoop'

interface SuggestionCardProps {
    suggestion: Suggestion
    index: number
    total: number
    onNext: () => void
    onPrev: () => void
    /** Team that Enter confirms after Goal / Own goal (defaults to the first team). */
    preselectTeam?: string
}

const ACTIONS: { type: KeepType | 'reject'; label: string; key: string }[] = [
    { type: 'goal', label: 'Goal', key: 'G' }, { type: 'own_goal', label: 'Own goal', key: 'O' },
    { type: 'save', label: 'Save', key: 'S' }, { type: 'highlight', label: 'Highlight', key: 'H' },
    { type: 'reject', label: 'Not a goal', key: 'X' },
]

/** One suggested moment: the player loops around it; a key or button decides it (goals and own goals then ask for the team). */
export function SuggestionCard({ suggestion, index, total, onNext, onPrev, preselectTeam }: SuggestionCardProps) {
    const teams = useAppState((s) => s.teams)
    const kickOff = useAppState(selectMatchStartSec)
    const long = useAppState(selectClockLong)
    const paused = usePlayerPaused()
    const playheadSec = useAppState((s) => (s.cumulativeOffsets[s.currentFileIndex] ?? 0) + s.currentTimeInFileSec)
    const estimateSec = Math.max(0, suggestion.globalTimeSec + AUDIO_DETECT.eventOffsetSec)
    // "At playhead" only once the user paused or stepped (the player is also paused briefly after each seek).
    const [adjusted, setAdjusted] = useState(false)
    const adjustedRef = useRef(false)
    const sawPlaying = useRef(false)
    const markAdjusted = (): void => { adjustedRef.current = true; setAdjusted(true) }
    useEffect(() => { sawPlaying.current = false; adjustedRef.current = false; setAdjusted(false) }, [suggestion.id])
    useEffect(() => {
        if (!paused) sawPlaying.current = true
        else if (sawPlaying.current) { adjustedRef.current = true; setAdjusted(true) }
    }, [paused, suggestion.id])
    const atPlayhead = paused && adjusted
    const goalSec = atPlayhead ? playheadSec : estimateSec
    const step = (kind: 'frame' | 'second', dir: 1 | -1): void => { markAdjusted(); stepPlayer(kind, dir) }
    const [needTeam, setNeedTeam] = useState<KeepType | null>(null)
    const loop = useReviewLoop(suggestion.globalTimeSec)
    useEffect(() => setNeedTeam(null), [suggestion.id])

    const decide = (type: KeepType | 'reject', team?: string): void => {
        const st = useAppState.getState()
        if (type === 'reject') st.decideSuggestion(suggestion.id, { kind: 'reject' })
        else {
            const atSec = isPlayerPaused() && adjustedRef.current ? (st.cumulativeOffsets[st.currentFileIndex] ?? 0) + st.currentTimeInFileSec : estimateSec
            st.decideSuggestion(suggestion.id, { kind: 'keep', type, atSec, ...(team ? { team } : {}) })
        }
        setNeedTeam(null)
        onNext()
    }
    const choose = (type: KeepType | 'reject'): void => {
        if ((type === 'goal' || type === 'own_goal') && teams.length >= 2) setNeedTeam(type)
        else decide(type)
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
            const arrow = e.key === 'ArrowUp' || e.key === 'ArrowDown'
            if (e.shiftKey && !arrow) return // only the arrows read Shift
            if (arrow) { e.preventDefault(); step(e.shiftKey ? 'second' : 'frame', e.key === 'ArrowUp' ? 1 : -1); return }
            if (e.repeat) return
            const k = e.key.toLowerCase()
            const onButton = !!(e.target as HTMLElement | null)?.closest?.('button')
            if (e.key === ' ' && !onButton) { e.preventDefault(); if (!isPlayerPaused()) markAdjusted(); togglePlayerPlayback(); return }
            if (e.key === 'Enter' && needTeam && !onButton) { e.preventDefault(); decide(needTeam, preselectTeam ?? teams[0]?.name); return }
            if (needTeam && (k === '1' || k === '2')) { e.preventDefault(); decide(needTeam, teams[Number(k) - 1]?.name); return }
            const a = ACTIONS.find((x) => x.key.toLowerCase() === k)
            if (a) { e.preventDefault(); choose(a.type); return }
            if (e.key === '[') { e.preventDefault(); loop.earlier(); return }
            if (e.key === ']') { e.preventDefault(); loop.later(); return }
            if (e.key === 'ArrowRight') { e.preventDefault(); onNext() }
            if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    return (
        <div className="review__card">
            <p className="review__count">Suggestion {index + 1} of {total} · <span className="tc">{formatClock(Math.max(0, suggestion.globalTimeSec - kickOff), long)}</span></p>
            {needTeam ? (
                <div className="review__actions" role="group" aria-label="Which team scored?">
                    {teams.slice(0, 2).map((t, i) => (
                        <button key={i} type="button" className="btn-quiet review__btn" onClick={() => decide(needTeam, t.name)}>
                            {t.name} <kbd>{i + 1}</kbd>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="review__actions" role="group" aria-label="What is it?">
                    {ACTIONS.map((a) => (
                        <button key={a.type} type="button" className={`${a.type === 'goal' ? 'btn-primary' : 'btn-quiet'} review__btn`} onClick={() => choose(a.type)}>
                            {a.label} <kbd>{a.key}</kbd>
                        </button>
                    ))}
                </div>
            )}
            <p className="review__goaltime">Goal time <span className="tc">{withTenths((w) => formatClock(w, long), goalSec - kickOff)}</span> · {atPlayhead ? 'at playhead' : 'estimate'}</p>
            {paused && (
                <div className="review__window" role="group" aria-label="Fine tune goal time">
                    <button type="button" className="btn-quiet review__btn" aria-label="Back one frame" onClick={() => step('frame', -1)}>◀ 1 frame <kbd>↓</kbd></button>
                    <button type="button" className="btn-quiet review__btn" aria-label="Forward one frame" onClick={() => step('frame', 1)}>1 frame ▶ <kbd>↑</kbd></button>
                </div>
            )}
            <div className="review__window" role="group" aria-label="Loop window">
                <button type="button" className="btn-quiet review__btn" aria-label="Start 2 seconds earlier" onClick={loop.earlier}>−2 s <kbd>[</kbd></button>
                <span className="tc review__range">{loop.window ? formatReviewWindow(suggestion.globalTimeSec, loop.window) : ''}</span>
                <button type="button" className="btn-quiet review__btn" aria-label="End 2 seconds later" onClick={loop.later}>+2 s <kbd>]</kbd></button>
            </div>
            <div className="review__nav">
                <button type="button" className="btn-quiet review__btn" onClick={onPrev} disabled={index === 0}>← Previous</button>
                <button type="button" className="btn-quiet review__btn" onClick={onNext}>Skip →</button>
            </div>
        </div>
    )
}
