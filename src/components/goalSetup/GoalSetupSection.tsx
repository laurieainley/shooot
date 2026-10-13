import { useRef, useState } from 'react'
import { useAppState } from '../../state'
import { useFrameAt } from '../frameGrab'
import { GoalSetupSummary } from '../GoalSetupSummary'
import { GoalSetup } from './GoalSetup'
import type { SetupStep } from './steps'

/**
 * The goals section of New match and Match setup: the compact summary (or the "Set up goals" button) and the layer
 * it opens. Edit buttons open the layer at that step only.
 */
export function GoalSetupSection() {
    const first = useAppState((s) => s.files[0])
    const duration = first?.durationSec || 0
    const frame = useFrameAt(first?.url, duration ? duration / 2 : null)
    const [open, setOpen] = useState<{ step: SetupStep; only: boolean } | null>(null)
    const section = useRef<HTMLElement | null>(null)

    return (
        <section ref={section} className="goal-areas" aria-label="Goal areas">
            <h3 className="export-section__title">Goal areas</h3>
            {first
                ? <GoalSetupSummary compact frame={frame.frame} onEdit={(step) => setOpen({ step, only: true })} onSetup={() => setOpen({ step: 'picture', only: false })} />
                : <p className="goal-areas__hint">Load a video to set up the goals.</p>}
            <p className="goal-areas__hint">Each goal is named after the team that defends it at Kick off.</p>
            {open && <GoalSetup startAt={open.step} only={open.only} onClose={() => setOpen(null)} />}
        </section>
    )
}
