import { useState } from 'react'
import { useAppState } from '../state'
import { formatHMS } from '../utils/timeline'
import { AddFilesButton } from './AddFilesButton'
import { GoalAreasSetup } from './GoalAreasSetup'
import { MatchDetails } from './MatchDetails'
import { OpeningStatus } from './OpeningStatus'
import { Sheet } from './Sheet'

interface NewMatchFlowProps {
    onClose: () => void
}

/**
 * New match, step by step: Videos, Match, then Goals (only once there are videos). Every step can be skipped and the
 * flow quit at any time (× or Esc); whatever was entered stays. The steps are the same sections as Match setup.
 */
export function NewMatchFlow({ onClose }: NewMatchFlowProps) {
    const files = useAppState((s) => s.files)
    const [step, setStep] = useState(0)
    const [message, setMessage] = useState<string | null>(null)
    const steps = files.length > 0 ? ['Videos', 'Match', 'Goals'] : ['Videos', 'Match']
    const last = step >= steps.length - 1

    return (
        <Sheet label="New match" onClose={onClose} className="sheet--wide">
            <ol className="steps" aria-label="Steps">
                {steps.map((name, i) => (
                    <li key={name} className="steps__item" aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined}>
                        <span className="steps__num" aria-hidden="true">{i + 1}</span>
                        <span className="steps__name">{name}</span>
                    </li>
                ))}
            </ol>
            <div className="steps__panel">
                {steps[step] === 'Videos' && (
                    <section aria-label="Videos" className="steps__videos">
                        <p className="m-0 text-[13px] text-muted">
                            {files.length === 0
                                ? 'Add the match videos first, so you can set the goals at the end. You can skip this and add them later.'
                                : 'Split into several files? Put them in filming order from Files later if needed.'}
                        </p>
                        {files.length > 0 && (
                            <ul className="steps__files">
                                {files.map((f) => (
                                    <li key={f.id}><span className="truncate">{f.name}</span><span className="text-muted">{f.durationSec ? formatHMS(f.durationSec) : ''}</span></li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            <AddFilesButton label={files.length ? 'Add more files' : 'Add videos'} className={files.length ? 'btn-quiet' : 'btn-primary'} onError={setMessage} />
                            <OpeningStatus />
                        </div>
                        {message && <p className="m-0 text-[12px] msg-warn">{message}</p>}
                    </section>
                )}
                {steps[step] === 'Match' && <MatchDetails />}
                {steps[step] === 'Goals' && <GoalAreasSetup />}
            </div>
            <div className="steps__nav">
                <button type="button" className="btn-quiet" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
                <span className="flex-1" />
                {step === 0 && files.length === 0
                    ? <button type="button" className="btn-quiet" onClick={() => setStep(1)}>Skip for now</button>
                    : last
                        ? <button type="button" className="btn-primary" onClick={onClose}>Done</button>
                        : <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>Next</button>}
            </div>
        </Sheet>
    )
}
