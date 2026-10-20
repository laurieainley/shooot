import { useAppState } from '../state'
import { hasPairs } from '../utils/playbackSource'
import { choosePlayback, playbackLocked, usePlaybackPref } from './playbackPref'
import { useRenderJobs } from '../renderJobs'
import { useDetectJob } from '../detectJobs'

interface PlaybackChoiceProps {
    /** `menu` sits in the ⋯ menu (big buttons, no hint); `sheet` is the Files sheet row with its one-line hint. */
    variant: 'menu' | 'sheet'
}

export const PLAYBACK_HINT = 'LRV plays smoothly and saves battery; MP4 is sharper. Exports always use the MP4.'

/** Playback LRV · MP4. Only shown when at least one file has both. Off (with the reason) while an export or Find goals runs. */
export function PlaybackChoice({ variant }: PlaybackChoiceProps) {
    const paired = useAppState((s) => hasPairs(s.files))
    const pref = usePlaybackPref()
    const rendering = useRenderJobs((s) => s.job?.phase === 'running')
    const finding = useDetectJob((j) => j.phase === 'running' || j.ballPhase === 'running')
    if (!paired) return null
    const reason = rendering || finding ? playbackLocked() : null
    const options = [['lrv', 'LRV'], ['mp4', 'MP4']] as const
    return (
        <div role="group" aria-label="Playback" className={`playback-choice playback-choice--${variant}`}>
            <span className="playback-choice__label">Playback</span>
            <div className="playback-choice__options">
                {options.map(([value, label]) => (
                    <button key={value} type="button" className="playback-choice__btn tc" aria-pressed={pref === value} disabled={reason !== null}
                        title={reason ?? undefined} onClick={() => choosePlayback(value)}>{label}</button>
                ))}
            </div>
            {reason && <span className="playback-choice__hint" role="status">{reason}</span>}
            {variant === 'sheet' && !reason && <span className="playback-choice__hint">{PLAYBACK_HINT}</span>}
        </div>
    )
}
