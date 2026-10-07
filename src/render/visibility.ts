// How long the page was hidden during a render (diagnostics only): a hidden tab is where timer throttling bites.

export type VisibilityDoc = EventTarget & { visibilityState: string }
export type HiddenStats = { hiddenCount: number; hiddenMs: number }

export function trackVisibility(doc: VisibilityDoc | undefined, now: () => number = Date.now): { stop: () => HiddenStats } {
    let hiddenCount = 0
    let hiddenMs = 0
    let since: number | null = null
    let stopped = false
    const hide = (): void => { if (since === null) { since = now(); hiddenCount++ } }
    const show = (): void => { if (since !== null) { hiddenMs += now() - since; since = null } }
    const onChange = (): void => { if (doc?.visibilityState === 'hidden') hide(); else show() }
    if (doc) {
        doc.addEventListener('visibilitychange', onChange)
        if (doc.visibilityState === 'hidden') hide()
    }
    return {
        stop: () => {
            if (!stopped) { stopped = true; doc?.removeEventListener('visibilitychange', onChange); show() }
            return { hiddenCount, hiddenMs }
        },
    }
}
