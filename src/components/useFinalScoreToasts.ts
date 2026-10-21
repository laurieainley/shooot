import { useEffect, useRef } from 'react'
import { useAppState } from '../state'
import { showToast, toastStore, type ToastAction } from '../toasts'
import { finalScore, formatScore, type Score } from '../utils/score'
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
    // Our over-the-score toast while it is still on screen: a tag toast that replaces it (the tag box commits the goal first, the toast comes when it closes) takes the reminder along.
    const mine = useRef<{ id: number; known: Score; update: ToastAction } | null>(null)
    const shown = useRef(-1) // id of the toast on screen before the one that just arrived
    useEffect(() => toastStore.subscribe((s) => {
        const prev = shown.current
        shown.current = s.toast?.id ?? -1
        if (!s.toast || s.toast.id === lastToast.current.id) return
        lastToast.current = { id: s.toast.id, at: Date.now() }
        const m = mine.current
        if (m && s.toast.id !== m.id && prev === m.id && s.toast.action) {
            const t = s.toast
            mine.current = null
            const id = showToast(`${t.text} · more than the final score (${formatScore(m.known)})`, t.action, m.update)
            lastToast.current = { id, at: Date.now() }
            shown.current = id
        } else if (m && prev === m.id) mine.current = null
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
            else mine.current = { id: showToast(`That’s more than the final score (${formatScore(known)}) — it may need updating.`, update), known, update }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [complete, over, known])
}
