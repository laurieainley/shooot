import { useMemo } from 'react'
import { useAppState } from '../state'
import type { GraphicsSettings as Settings } from '../graphics/plan'
import { graphicsSupport } from '../utils/capabilities'

const OPTIONS: { key: keyof Settings; label: string; hint: string }[] = [
    { key: 'cards', label: 'Title & full-time cards', hint: 'VS card before, final score after' },
    { key: 'lowerThirds', label: 'Event captions', hint: 'Top left for 5 s: goals, penalties, highlights with a note' },
    { key: 'replayTag', label: 'Replay tag', hint: 'Small “REPLAY” top right on slow-motion replays' },
]

/** Export panel switches for the match graphics drawn into the rendered reel. */
export function GraphicsSettings() {
    const graphics = useAppState((s) => s.graphics)
    const setGraphics = useAppState((s) => s.setGraphics)
    const support = useMemo(() => graphicsSupport(globalThis as unknown as Record<string, unknown>), [])

    return (
        <div className="flex flex-col">
            {!support.ok && <p role="note" className="export-note">{support.message}</p>}
            {OPTIONS.map((o) => (
                <label key={o.key} className="toggle-row">
                    <input type="checkbox" disabled={!support.ok} checked={support.ok && !!graphics[o.key]} onChange={(e) => setGraphics({ [o.key]: e.target.checked })} />
                    <span className="toggle-row__text">
                        {o.label}
                        <span className="toggle-row__hint">{o.hint}</span>
                    </span>
                </label>
            ))}
        </div>
    )
}
