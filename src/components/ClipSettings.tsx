import { useId } from 'react'
import { useAppState } from '../state'
import { smoothSetting } from '../player/msePlan'

export function ClipSettings() {
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const setLengthBeforeGoal = useAppState((s) => s.setLengthBeforeGoal)
    const setLengthAfterGoal = useAppState((s) => s.setLengthAfterGoal)
    const replayBeforeSec = useAppState((s) => s.replayBeforeSec)
    const replayAfterSec = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)
    const setReplayWindow = useAppState((s) => s.setReplayWindow)
    const setReplaySpeed = useAppState((s) => s.setReplaySpeed)
    const smooth = useAppState((s) => s.smoothPlayback)
    const setSmooth = useAppState((s) => s.setSmoothPlayback)
    const id = useId()

    return (
        <div className="flex flex-col gap-4">
            <fieldset className="settings-group">
                <legend>Clip around each event</legend>
                <div className="settings-field">
                    <label htmlFor={`${id}-1`}>Before</label>
                    <input id={`${id}-1`} type="number" min="0" max="60" value={lengthBeforeGoalSec}
                        onChange={(e) => setLengthBeforeGoal(parseInt(e.target.value) || 0)} className="field tc" />
                    <span className="unit">s</span>
                </div>
                <div className="settings-field">
                    <label htmlFor={`${id}-2`}>After</label>
                    <input id={`${id}-2`} type="number" min="0" max="60" value={lengthAfterGoalSec}
                        onChange={(e) => setLengthAfterGoal(parseInt(e.target.value) || 0)} className="field tc" />
                    <span className="unit">s</span>
                </div>
            </fieldset>

            <fieldset className="settings-group">
                <legend>Slow-mo replay</legend>
                <div className="settings-field">
                    <label htmlFor={`${id}-3`}>Replay before</label>
                    <input id={`${id}-3`} type="number" min="0" max="15" value={replayBeforeSec}
                        onChange={(e) => setReplayWindow(parseInt(e.target.value) || 0, replayAfterSec)} className="field tc" />
                    <span className="unit">s</span>
                </div>
                <div className="settings-field">
                    <label htmlFor={`${id}-4`}>Replay after</label>
                    <input id={`${id}-4`} type="number" min="0" max="15" value={replayAfterSec}
                        onChange={(e) => setReplayWindow(replayBeforeSec, parseInt(e.target.value) || 0)} className="field tc" />
                    <span className="unit">s</span>
                </div>
                <div className="settings-field">
                    <label htmlFor={`${id}-5`}>Replay speed</label>
                    <select id={`${id}-5`} value={replaySpeed} onChange={(e) => setReplaySpeed(parseFloat(e.target.value))} className="field tc">
                        <option value="0.5">0.5×</option>
                        <option value="0.25">0.25×</option>
                    </select>
                </div>
            </fieldset>

            <fieldset className="settings-group">
                <legend>Playback</legend>
                <div className="settings-field">
                    <label htmlFor={`${id}-6`}>Smooth playback for large files</label>
                    <select id={`${id}-6`} value={smooth} onChange={(e) => setSmooth(smoothSetting(e.target.value))} className="field">
                        <option value="large">On for large files</option>
                        <option value="always">On for all files</option>
                        <option value="off">Off (classic)</option>
                    </select>
                </div>
            </fieldset>
        </div>
    )
}
