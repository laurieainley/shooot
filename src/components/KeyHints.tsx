const HINTS: [string[], string][] = [
    [['G'], 'mark'], [['⇧←', '⇧→'], '1s'], [['↑', '↓'], 'frame'], [[',', '.'], 'speed'],
    [['Home'], 'kick-off'], [['Z'], 'zoom'], [['L'], 'log'], [['⌘Z'], 'undo'],
]

/** One line of the shortcuts that matter while marking (desktop only). */
export function KeyHints() {
    return (
        <footer className="key-hints" aria-label="Keyboard shortcuts">
            {HINTS.map(([keys, what]) => (
                <span key={what} className="key-hint">
                    {keys.map((k) => <kbd key={k}>{k}</kbd>)}<span>{what}</span>
                </span>
            ))}
        </footer>
    )
}
