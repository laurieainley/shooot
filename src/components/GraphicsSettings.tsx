import { useAppState } from '../state'
import type { GraphicsSettings as Settings } from '../graphics/plan'

const OPTIONS: { key: keyof Settings; label: string; hint: string }[] = [
    { key: 'cards', label: 'Title & full-time cards', hint: 'Matchday VS card before, final score after' },
    { key: 'lowerThirds', label: 'Lower thirds', hint: 'Goals, penalties and highlights with a note' },
    { key: 'replayTag', label: 'Replay tag', hint: 'Small “REPLAY” on slow-motion replays' },
]

/** Export panel switches for the match graphics drawn into the rendered reel. */
export function GraphicsSettings() {
    const graphics = useAppState((s) => s.graphics)
    const setGraphics = useAppState((s) => s.setGraphics)
    return (
        <div className="flex flex-col">
            {OPTIONS.map((o) => (
                <label key={o.key} className="toggle-row">
                    <input type="checkbox" checked={graphics[o.key]} onChange={(e) => setGraphics({ [o.key]: e.target.checked })} />
                    <span className="toggle-row__text">
                        {o.label}
                        <span className="toggle-row__hint">{o.hint}</span>
                    </span>
                </label>
            ))}
        </div>
    )
}
