import { useAppState } from '../state'

export function ClipSettings() {
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const setLengthBeforeGoal = useAppState((s) => s.setLengthBeforeGoal)
    const setLengthAfterGoal = useAppState((s) => s.setLengthAfterGoal)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const setAdjustTimestampsByOffset = useAppState((s) => s.setAdjustTimestampsByOffset)

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
