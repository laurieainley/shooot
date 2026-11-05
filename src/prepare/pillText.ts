import type { PrepareStatus } from './preparer'

// Text presentation, not the coloured emoji.
export const PAUSE = '\u23F8\uFE0E'
export const PLAY = '\u25B6\uFE0E'
export const WARN = '\u26A0\uFE0E'

/** What the pill says and what its tooltip adds. */
export function pillText(s: PrepareStatus): { label: string; tip: string; tone: 'busy' | 'ok' | 'warn' | 'quiet' } | null {
    switch (s.kind) {
        case 'hidden': return null
        case 'preparing': return { label: `Preparing ${s.what} · ${s.percent}%`, tip: `Encoding the ${s.what} in the background while you edit, so Export only has to redo what you change. It slows down while the video plays and stops while you export.`, tone: 'busy' }
        case 'paused': return s.byUser
            ? { label: 'Paused', tip: 'Preparing is paused. Press play to carry on.', tone: 'quiet' }
            : { label: 'Paused while exporting', tip: 'Preparing carries on when the export is done.', tone: 'quiet' }
        case 'ready': return { label: 'Ready ✓', tip: s.text, tone: 'ok' }
        case 'nospace': return { label: `${WARN} Not enough space`, tip: s.text, tone: 'warn' }
    }
}

