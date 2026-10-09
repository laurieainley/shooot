import { SHORTCUT_GROUPS } from '../utils/shortcutList'
import { Sheet } from './Sheet'

interface ShortcutsSheetProps {
    onClose: () => void
}

/** Every keyboard shortcut, grouped (opened with ? or from the ⋯ menu). */
export function ShortcutsSheet({ onClose }: ShortcutsSheetProps) {
    return (
        <Sheet label="Shortcuts" onClose={onClose} className="sheet--narrow shortcuts-sheet">
            {SHORTCUT_GROUPS.map((g) => (
                <section key={g.title} aria-label={g.title} className="shortcuts-group">
                    <h3 className="shortcuts-group__title">{g.title}</h3>
                    <dl className="shortcuts-list">
                        {g.rows.map((r) => (
                            <div key={r.what} className="shortcuts-row">
                                <dt>{r.keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
                                <dd>{r.what}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </Sheet>
    )
}
