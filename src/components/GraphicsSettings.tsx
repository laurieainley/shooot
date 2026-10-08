import { useMemo } from 'react'
import { useAppState } from '../state'
import { THEMES, getTheme } from '../graphics/themes'
import { graphicsSupport } from '../utils/capabilities'

const OPTIONS: { key: 'cards' | 'lowerThirds' | 'replayTag'; label: string; hint: string }[] = [
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
            <div role="radiogroup" aria-label="Graphics look" className="theme-picker">
                {THEMES.map((th) => (
                    <button
                        key={th.id} type="button" role="radio" aria-checked={getTheme(graphics.theme).id === th.id} disabled={!support.ok}
                        className="theme-chip" onClick={() => setGraphics({ theme: th.id })}
                    >
                        <span className="theme-chip__swatch" aria-hidden="true" style={{ background: th.swatch.ground, color: th.swatch.accent }}>
                            <span style={{ background: th.swatch.accent, color: th.swatch.ground }}>1–0</span>
                        </span>
                        <span className="theme-chip__name">{th.name}</span>
                    </button>
                ))}
            </div>
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
