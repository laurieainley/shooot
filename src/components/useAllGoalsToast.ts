import { useEffect, useRef } from 'react'
import { useAppState } from '../state'
import { showToast, toastStore } from '../toasts'
import { finalScore } from '../utils/score'
import { scoreGap } from '../utils/scoreGap'

/** A toast younger than this came with the change that completed the score, so the note joins it. */
const SAME_ACTION_MS = 500

/**
 * Once, when the tagged goals reach the known final score (false → true, never on mount): "All N goals tagged".
 * After a Confirm / Tag the note joins that toast's text (its Undo stays); otherwise it is a toast of its own.
 */
export function useAllGoalsToast(): void {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const known = useAppState((s) => s.knownFinalScore)
    const complete = teams.length >= 2 && !!scoreGap(finalScore(events, teams), known)?.complete
    const was = useRef(complete)
    const lastToast = useRef({ id: -1, at: 0 })
    useEffect(() => toastStore.subscribe((s) => {
        if (s.toast && s.toast.id !== lastToast.current.id) lastToast.current = { id: s.toast.id, at: Date.now() }
    }), [])
    useEffect(() => {
        const before = was.current
        was.current = complete
        if (before || !complete || !known) return
        const n = known[0] + known[1]
        const cur = toastStore.getState().toast
        if (cur && cur.id === lastToast.current.id && Date.now() - lastToast.current.at < SAME_ACTION_MS) showToast(`${cur.text} · all goals tagged`, cur.action)
        else showToast(`All ${n} ${n === 1 ? 'goal' : 'goals'} tagged — the rest of the review is optional`)
    }, [complete, known])
}
