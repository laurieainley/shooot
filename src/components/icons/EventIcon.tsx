import type { ReactElement, ReactNode } from 'react'
import type { MatchEvent } from '../../types'
import { eventIconKey, eventIconLabel, isGoalIcon, type EventIconKey } from '../../utils/eventIcon'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** The football, centre (12,12): outline, a filled centre pentagon and five seams. */
function Football(): ReactElement {
    return (
        <>
            <circle cx="12" cy="12" r="9.25" {...STROKE} />
            <path d="M12 8.4l3.42 2.49-1.3 4.02H9.88l-1.3-4.02z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
            <path d="M12 8.4V2.9M15.42 10.89l5.2-1.75M14.12 14.91l3.3 4.4M9.88 14.91l-3.3 4.4M8.58 10.89l-5.2-1.75" {...STROKE} />
        </>
    )
}

const MINI = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.15, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** A small label in the football's lower-right corner ("P", "OG"), drawn as paths so the icon holds no text. */
function Badge({ w, children }: { w: number; children: ReactNode }): ReactElement {
    return (
        <>
            <rect x={23.3 - w} y="14.2" width={w} height="9.2" rx="3" fill="var(--sh-surface)" stroke="currentColor" strokeWidth="1.25" />
            <g {...MINI}>{children}</g>
        </>
    )
}

const GLYPHS: Record<EventIconKey, () => ReactElement> = {
    goal: Football,
    penalty_goal: () => <><Football /><Badge w={9}><path d="M17.8 21.2v-4.8h1.5a1.4 1.4 0 0 1 0 2.8h-1.5" /></Badge></>,
    own_goal: () => <><Football /><Badge w={12.5}><rect x="12.6" y="16.4" width="2.8" height="4.8" rx="1.4" /><path d="M20.9 17.4a1.5 1.5 0 0 0-1.3-1 1.5 1.5 0 0 0-1.5 1.5v1.8a1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.4v-.6h-1.2" /></Badge></>,
    penalty_conceded: () => (
        <>
            <path d="M3 20.5h18" {...STROKE} />
            <circle cx="12" cy="12.5" r="3" fill="currentColor" stroke="none" />
        </>
    ),
    penalty_missed: () => (
        <>
            <path d="M3 20.5h18" {...STROKE} />
            <circle cx="12" cy="12.5" r="3" fill="currentColor" stroke="none" />
            <path d="M6 4.5l12 12M18 4.5l-12 12" {...STROKE} />
        </>
    ),
    // Goalkeeper glove: four fingers, a thumb and a cuff.
    save: () => (
        <>
            <path d="M7.5 21v-5.2L4.4 11.6a1.55 1.55 0 0 1 2.5-1.8l1.6 2.1V5.2a1.5 1.5 0 0 1 3 0V9V3.7a1.5 1.5 0 0 1 3 0V9V5a1.5 1.5 0 0 1 3 0v8.4c0 2.1-.7 3.4-1.7 4.4V21z" {...STROKE} />
            <path d="M7.5 18.4h8.2" {...STROKE} />
        </>
    ),
    // Referee's whistle: body, mouthpiece, lanyard ring and the pea hole.
    foul: () => (
        <>
            <circle cx="14.5" cy="14.5" r="5.75" {...STROKE} />
            <path d="M9.6 11.4L2.8 9.2v4.3l5.8 1.1M14.5 8.75V5.5" {...STROKE} />
            <circle cx="14.5" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
        </>
    ),
    highlight: () => <path d="M12 2.9l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.7l-5.4 3 1.1-6.1-4.5-4.3 6.1-.8z" {...STROKE} />,
    kick_off: () => <path d="M5.5 21.5V2.8M5.5 4h12.2l-3.3 4.4 3.3 4.4H5.5" {...STROKE} />,
    half_time: () => (
        <>
            <circle cx="12" cy="12" r="9.25" {...STROKE} />
            <path d="M9.5 8.3v7.4M14.5 8.3v7.4" {...STROKE} />
        </>
    ),
    // Chequered flag: pole and a 4 x 3 board with alternate squares filled.
    final_whistle: () => (
        <>
            <path d="M4.5 21.5V2.8" {...STROKE} />
            <rect x="4.5" y="4" width="15.5" height="10.5" {...STROKE} strokeWidth="1.4" />
            <path d="M8.4 4h3.9v3.5H8.4zM16.1 4H20v3.5h-3.9zM4.5 7.5h3.9V11H4.5zM12.3 7.5h3.8V11h-3.8zM8.4 11h3.9v3.5H8.4zM16.1 11H20v3.5h-3.9z" fill="currentColor" stroke="none" />
        </>
    ),
}

interface EventIconProps {
    event: Pick<MatchEvent, 'type'> & { pen?: boolean }
    /** Pixel size (the glyph is drawn on a 24 grid). */
    size?: number
    /** Decorative next to a visible label: no accessible name of its own. */
    decorative?: boolean
    className?: string
}

/**
 * The one icon set for events (strip, rows, picker, edit sheet, summaries): line art on a 24 grid, 1.75 stroke, currentColor.
 * Goals are the only lime ones (`.ev-icon--goal`); an own goal is a chalk football with an "OG" label.
 */
export function EventIcon({ event, size = 18, decorative = false, className = '' }: EventIconProps) {
    const key = eventIconKey(event)
    const Glyph = GLYPHS[key]
    const label = eventIconLabel(event)
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} focusable="false" data-icon={key}
            className={`ev-icon ev-icon--${key.replace('_', '-')}${isGoalIcon(key) ? ' ev-icon--goal' : ''}${className ? ` ${className}` : ''}`}
            {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}>
            <Glyph />
        </svg>
    )
}
