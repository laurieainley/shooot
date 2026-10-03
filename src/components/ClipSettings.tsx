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

    return (
        <div className="rounded-md bg-surface p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-light block mb-2.5">Clip Settings</span>

            <div className="flex gap-3 mb-2">
                <div>
                    <span className="text-[10px] text-muted block mb-1">Before</span>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthBeforeGoalSec}
                        onChange={(e) => setLengthBeforeGoal(parseInt(e.target.value) || 0)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </div>
                <div>
                    <span className="text-[10px] text-muted block mb-1">After</span>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthAfterGoalSec}
                        onChange={(e) => setLengthAfterGoal(parseInt(e.target.value) || 0)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </div>
            </div>

            <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mt-3 mb-1">Replay</span>
            <div className="flex gap-3 mb-2">
                <label>
                    <span className="text-[10px] text-muted block mb-1">Replay before</span>
                    <input
                        type="number"
                        min="0"
                        max="15"
                        value={replayBeforeSec}
                        onChange={(e) => setReplayWindow(parseInt(e.target.value) || 0, replayAfterSec)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </label>
                <label>
                    <span className="text-[10px] text-muted block mb-1">Replay after</span>
                    <input
                        type="number"
                        min="0"
                        max="15"
                        value={replayAfterSec}
                        onChange={(e) => setReplayWindow(replayBeforeSec, parseInt(e.target.value) || 0)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </label>
                <label>
                    <span className="text-[10px] text-muted block mb-1">Replay speed</span>
                    <select
                        value={replaySpeed}
                        onChange={(e) => setReplaySpeed(parseFloat(e.target.value))}
                        className="rounded bg-deep border border-border px-2 py-1 text-sm text-light focus:border-pink focus:outline-none"
                    >
                        <option value="0.5">0.5×</option>
                        <option value="0.25">0.25×</option>
                    </select>
                </label>
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={adjustTimestampsByOffset}
                    onChange={(e) => setAdjustTimestampsByOffset(e.target.checked)}
                    className="accent-pink"
                />
                <span className="text-xs text-muted">Adjust timestamps by offset</span>
            </label>
        </div>
    )
}
