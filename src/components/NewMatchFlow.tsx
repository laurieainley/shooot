import { useState } from 'react'
import { useAppState } from '../state'
import { AddFilesButton } from './AddFilesButton'
import { FileList } from './FilesSheet'
import { GoalSetupSection } from './goalSetup/GoalSetupSection'
import { MatchDetails } from './MatchDetails'
import { OpeningStatus } from './OpeningStatus'
import { Sheet } from './Sheet'

const STEPS = ['Videos', 'Match', 'Goals'] as const

interface NewMatchFlowProps {
    onClose: () => void
}

/**
 * New match, step by step: Videos, Match, Goals (all shown from the start; Goals needs the videos). Every step can be
 * skipped. Only the × closes it (a stray click outside or Esc must not throw away what was typed); whatever was
 * entered stays. The steps are the same sections as Match setup, and Videos is the Files sheet's list.
 */
export function NewMatchFlow({ onClose }: NewMatchFlowProps) {
    const files = useAppState((s) => s.files)
    const [step, setStep] = useState(0)
    const [message, setMessage] = useState<string | null>(null)
    const last = step >= STEPS.length - 1

    return (
        <Sheet label="New match" onClose={onClose} className="sheet--wide sheet--steps" persistent>
            <ol className="steps" aria-label="Steps">
                {STEPS.map((name, i) => (
                    <li key={name} className="steps__item" aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined}>
                        <span className="steps__num" aria-hidden="true">{i + 1}</span>
                        <span className="steps__name">{name}</span>
                    </li>
                ))}
            </ol>
            <div className="steps__panel">
                {STEPS[step] === 'Videos' && (
                    <section aria-label="Videos" className="steps__videos">
                        <p className="steps__lead">
                            Add the match videos first: the last step uses them to set up the goals for replays. You can skip this and add them later.
                        </p>
                        {files.length === 0 ? (
                            <div className="steps__drop">
                                <AddFilesButton label="Add videos" className="btn-quiet" onError={setMessage} />
                                <OpeningStatus />
                            </div>
                        ) : (
                            <>
                                <FileList onPlay={(i) => useAppState.getState().setCurrentFileIndex(i)} onError={setMessage} />
                                <div className="flex flex-wrap items-center gap-2">
                                    <AddFilesButton label="Add more files" className="btn-quiet" onError={setMessage} />
                                    <OpeningStatus />
                                </div>
                            </>
                        )}
                        {message && <p className="m-0 text-[12px] msg-warn">{message}</p>}
                    </section>
                )}
                {STEPS[step] === 'Match' && <MatchDetails compact />}
                {STEPS[step] === 'Goals' && (files.length > 0
                    ? <GoalSetupSection />
                    : <p className="steps__lead">Goals needs the videos: you mark each goal mouth on the footage so replays zoom to the right end. Go back to add them, or finish now and set the goals up later in Setup.</p>)}
            </div>
            <div className="steps__nav">
                <button type="button" className="btn-quiet" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
                <span className="flex-1" />
                {step === 0 && files.length === 0 && <button type="button" className="btn-quiet" onClick={() => setStep(1)}>Skip for now</button>}
                {last
                    ? <button type="button" className="btn-primary" onClick={onClose}>Done</button>
                    : <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>Next</button>}
            </div>
        </Sheet>
    )
}
