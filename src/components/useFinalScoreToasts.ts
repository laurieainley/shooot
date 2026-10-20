import { useEffect, useRef } from 'react'
import { useAppState } from '../state'
import { showToast, toastStore } from '../toasts'
import { finalScore, formatScore } from '../utils/score'
import { isOver, raisedScore, scoreGap } from '../utils/scoreGap'
import { raiseFinalScore } from './raiseFinalScore'

/** A toast younger than this came with the change that moved the score, so the note joins it. */
const SAME_ACTION_MS = 500

/**
 * Mount once in the editor. Two one-off notes, each only on a change (never on mount):
 * - tagged goals reach the known final score (false → true): "All N goals tagged";
 * - tagged goals go over it (false → true, again after going back under): "That's more than the final score (13–9) — it may need updating." + Update to 14–9.
 * After a Confirm / Tag the note joins that toast's text (its Undo stays; Update to … takes the secondary slot).
 */
export function useFinalScoreToasts(): void {
    const events = useAppState((s) => s.events)
    const teams = useAppState((s) => s.teams)
    const known = useAppState((s) => s.knownFinalScore)
    const gap = teams.length >= 2 ? scoreGap(finalScore(events, teams), known) : null
    const complete = !!gap?.complete
    const over = isOver(gap)
    const was = useRef({ complete, over })
    const lastToast = useRef({ id: -1, at: 0 })
    useEffect(() => toastStore.subscribe((s) => {
        if (s.toast && s.toast.id !== lastToast.current.id) lastToast.current = { id: s.toast.id, at: Date.now() }
    }), [])
    useEffect(() => {
        const before = was.current
        was.current = { complete, over }
        if (!known) return
        const cur = toastStore.getState().toast
        const fresh = !!cur && cur.id === lastToast.current.id && Date.now() - lastToast.current.at < SAME_ACTION_MS
        if (!before.complete && complete) {
            const n = known[0] + known[1]
            if (fresh && cur) showToast(`${cur.text} · all goals tagged`, cur.action)
            else showToast(`All ${n} ${n === 1 ? 'goal' : 'goals'} tagged — the rest of the review is optional`)
        } else if (!before.over && over) {
            const next = raisedScore(finalScore(events, teams), known)
            const update = { label: `Update to ${formatScore(next)}`, run: raiseFinalScore }
            if (fresh && cur) showToast(`${cur.text} · more than the final score (${formatScore(known)})`, cur.action, update)
            else showToast(`That’s more than the final score (${formatScore(known)}) — it may need updating.`, update)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [complete, over, known])
}
