import { useState } from 'react'
import { blockerText, startNewMatch, stopBlocker, switchBlocker, type SwitchBlocker } from './matchSwitch'

/** Top bar "New match" (desktop and tablet): starts a fresh match, asking first only when a render or Find goals run would stop. */
export function NewMatchButton() {
    const [blocker, setBlocker] = useState<SwitchBlocker>(null)
    return (
        <span className="new-match-btn">
            <button type="button" className="top-btn top-btn--quiet" onClick={() => { const b = switchBlocker(); if (b) setBlocker(b); else void startNewMatch() }}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                New match
            </button>
            {blocker && (
                <div role="alertdialog" aria-label="New match" className="new-match-btn__confirm">
                    <p className="m-0">{blockerText(blocker)}</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { stopBlocker(); setBlocker(null); void startNewMatch() }} className="btn-quiet btn-danger">Stop and switch</button>
                        <button type="button" onClick={() => setBlocker(null)} className="btn-quiet">Cancel</button>
                    </div>
                </div>
            )}
        </span>
    )
}
