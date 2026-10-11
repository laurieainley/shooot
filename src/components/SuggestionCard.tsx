import { useEffect, useState } from 'react'
import { selectClockLong, selectMatchStartSec, useAppState } from '../state'
import type { KeepType, Suggestion } from '../types'
import { formatClock } from '../utils/timeline'
import { useReviewLoop } from './useReviewLoop'

interface SuggestionCardProps {
    suggestion: Suggestion
    index: number
    total: number
    onNext: () => void
    onPrev: () => void
}

const ACTIONS: { type: KeepType | 'reject'; label: string; key: string }[] = [
    { type: 'goal', label: 'Goal', key: 'G' }, { type: 'own_goal', label: 'Own goal', key: 'O' },
    { type: 'save', label: 'Save', key: 'S' }, { type: 'highlight', label: 'Highlight', key: 'H' },
    { type: 'reject', label: 'Not a goal', key: 'X' },
]

/** One suggested moment: the player loops around it; a key or button decides it (goals and own goals then ask for the team). */
export function SuggestionCard({ suggestion, index, total, onNext, onPrev }: SuggestionCardProps) {
    const teams = useAppState((s) => s.teams)
    const kickOff = useAppState(selectMatchStartSec)
    const long = useAppState(selectClockLong)
    const [needTeam, setNeedTeam] = useState<KeepType | null>(null)
    useReviewLoop(suggestion.globalTimeSec)
    useEffect(() => setNeedTeam(null), [suggestion.id])

    const decide = (type: KeepType | 'reject', team?: string): void => {
        const st = useAppState.getState()
        if (type === 'reject') st.decideSuggestion(suggestion.id, { kind: 'reject' })
        else st.decideSuggestion(suggestion.id, { kind: 'keep', type, ...(team ? { team } : {}) })
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
            const k = e.key.toLowerCase()
            if (needTeam && (k === '1' || k === '2')) { e.preventDefault(); decide(needTeam, teams[Number(k) - 1]?.name); return }
            const a = ACTIONS.find((x) => x.key.toLowerCase() === k)
            if (a) { e.preventDefault(); choose(a.type); return }
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
                        <button key={t.name} type="button" className="btn-quiet review__btn" onClick={() => decide(needTeam, t.name)}>
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
            <div className="review__nav">
                <button type="button" className="btn-quiet review__btn" onClick={onPrev} disabled={index === 0}>← Previous</button>
                <button type="button" className="btn-quiet review__btn" onClick={onNext}>Skip →</button>
            </div>
        </div>
    )
}
