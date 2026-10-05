import { useId } from 'react'
import { useAppState } from '../state'

export function ClipSettings() {
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const setLengthBeforeGoal = useAppState((s) => s.setLengthBeforeGoal)
    const setLengthAfterGoal = useAppState((s) => s.setLengthAfterGoal)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const setAdjustTimestampsByOffset = useAppState((s) => s.setAdjustTimestampsByOffset)
    const replayBeforeSec = useAppState((s) => s.replayBeforeSec)
    const replayAfterSec = useAppState((s) => s.replayAfterSec)
    const replaySpeed = useAppState((s) => s.replaySpeed)
    const setReplayWindow = useAppState((s) => s.setReplayWindow)
    const setReplaySpeed = useAppState((s) => s.setReplaySpeed)
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

            <label className="toggle-row">
                <input type="checkbox" checked={adjustTimestampsByOffset}
                    onChange={(e) => setAdjustTimestampsByOffset(e.target.checked)} />
                <span className="toggle-row__text">Adjust timestamps by offset</span>
            </label>
        </div>
    )
}
