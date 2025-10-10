import { useAppState } from '../state'

export function HighlightLengthControls() {
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const setLengthBeforeGoal = useAppState((s) => s.setLengthBeforeGoal)
    const setLengthAfterGoal = useAppState((s) => s.setLengthAfterGoal)

    return (
        <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1em' }}>Highlight Length</h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ fontSize: '0.9em', minWidth: '80px' }}>Length before:</label>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthBeforeGoalSec}
                        onChange={(e) => setLengthBeforeGoal(parseInt(e.target.value) || 0)}
                        style={{ width: '60px', padding: '4px 6px', fontSize: '0.9em' }}
                    />
                    <span style={{ fontSize: '0.8em', color: '#666' }}>seconds</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ fontSize: '0.9em', minWidth: '80px' }}>Length after:</label>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthAfterGoalSec}
                        onChange={(e) => setLengthAfterGoal(parseInt(e.target.value) || 0)}
                        style={{ width: '60px', padding: '4px 6px', fontSize: '0.9em' }}
                    />
                    <span style={{ fontSize: '0.8em', color: '#666' }}>seconds</span>
                </div>
            </div>
            <div style={{ fontSize: '0.8em', color: '#666', marginTop: 4 }}>
                Each goal highlight will include {lengthBeforeGoalSec}s before and {lengthAfterGoalSec}s after the goal time.
            </div>
        </div>
    )
}
