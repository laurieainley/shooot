import { useAppState } from '../state'
import { THEMES, getTheme } from '../graphics/themes'

/** Match setup: the look of everything drawn on the match (reel graphics, cards and the YouTube thumbnail). */
export function GraphicsStylePicker() {
    const theme = useAppState((s) => s.graphics.theme)
    const setGraphics = useAppState((s) => s.setGraphics)
    return (
        <div className="graphics-style">
            <span className="text-ui-sm text-muted">Graphics style (reel graphics and thumbnails)</span>
            <div role="radiogroup" aria-label="Graphics style" className="theme-picker">
                {THEMES.map((th) => (
                    <button
                        key={th.id} type="button" role="radio" aria-checked={getTheme(theme).id === th.id}
                        className="theme-chip" onClick={() => setGraphics({ theme: th.id })}
                    >
                        <span className="theme-chip__swatch" aria-hidden="true" style={{ background: th.swatch.ground, color: th.swatch.accent }}>
                            <span style={{ background: th.swatch.accent, color: th.swatch.ground }}>1–0</span>
                        </span>
                        <span className="theme-chip__name">{th.name}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}
