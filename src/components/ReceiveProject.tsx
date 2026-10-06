import { useEffect, useState } from 'react'
import { useAppState } from '../state'
import { decodeProject, fragmentData, type TransferPayload } from '../utils/projectTransfer'
import { applyTransferPayload } from './applyProject'
import { Sheet } from './Sheet'

function clearFragment(): void {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/**
 * Opening a transfer link (`/#p=…`): load the project it carries (asking first if this device already has events),
 * then clear the fragment. The Relink banner takes over from there, since the events have no videos yet.
 */
export function ReceiveProject() {
    const [pending, setPending] = useState<TransferPayload | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        let inFlight: string | null = null
        const check = (): void => {
            const data = fragmentData(window.location.hash)
            if (!data || data === inFlight) return
            inFlight = data
            void decodeProject(data).then(
                (payload) => {
                    if (!live) return
                    inFlight = null
                    if (useAppState.getState().events.length > 0) { setPending(payload); return }
                    applyTransferPayload(payload)
                    clearFragment()
                },
                (e: unknown) => {
                    if (!live) return
                    inFlight = null
                    setError(e instanceof Error ? e.message : 'This link is damaged.')
                    clearFragment()
                },
            )
        }
        check()
        window.addEventListener('hashchange', check)
        return () => { live = false; window.removeEventListener('hashchange', check) }
    }, [])

    const done = (replace: boolean): void => {
        if (replace && pending) applyTransferPayload(pending)
        setPending(null)
        clearFragment()
    }

    return (
        <>
            {error && (
                <div role="alert" className="receive-error">
                    <span>Could not open the project link: {error}</span>
                    <button type="button" className="btn-quiet" onClick={() => setError(null)}>Dismiss</button>
                </div>
            )}
            {pending && (
                <Sheet label="Replace project" onClose={() => done(false)} className="sheet--narrow">
                    <div role="alertdialog" aria-label="Replace project" className="flex flex-col gap-3 py-2 text-[14px]">
                        <p className="m-0">Replace current project with the received one?</p>
                        <p className="m-0 text-muted">
                            Received: {pending.events.length} {pending.events.length === 1 ? 'event' : 'events'}. You have {useAppState.getState().events.length}. ⌘Z brings the old events back.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn-primary" onClick={() => done(true)}>Replace</button>
                            <button type="button" className="btn-quiet" onClick={() => done(false)}>Keep current</button>
                        </div>
                    </div>
                </Sheet>
            )}
        </>
    )
}
