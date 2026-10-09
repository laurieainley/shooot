import type { ShortcutAction } from './shortcuts'

export type ShortcutRow = {
    keys: string[]
    what: string
    /** The player action behind a plain key, so the list and the key handler cannot drift apart (checked in tests). */
    action?: ShortcutAction
    /** The key (event.key) that triggers `action`, for the check above. */
    key?: string
}

export type ShortcutGroup = { title: string; rows: ShortcutRow[] }

/** Every keyboard shortcut, grouped, for the Shortcuts sheet (opened with ? or from the ⋯ menu). */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        title: 'Playback',
        rows: [
            { keys: ['Space'], what: 'Play / pause', action: 'playPause', key: ' ' },
            { keys: ['M'], what: 'Mute', action: 'mute', key: 'm' },
            { keys: [','], what: 'Slower (0.25× steps)', action: 'speedDown', key: ',' },
            { keys: ['.'], what: 'Faster (0.25× steps)', action: 'speedUp', key: '.' },
            { keys: ['/'], what: 'Normal speed', action: 'speedReset', key: '/' },
            { keys: ['F'], what: 'Fullscreen', action: 'fullscreen', key: 'f' },
        ],
    },
    {
        title: 'Tagging',
        rows: [
            { keys: ['G'], what: 'Tag an event at the playhead', action: 'mark', key: 'g' },
            { keys: ['K', 'T', 'W'], what: 'In the picker: Kick off, Half time, Final whistle' },
            { keys: ['P', 'O', 'A', 'X', 'H', 'F', 'S'], what: 'In the picker: penalty goal, own goal, penalty conceded / missed, highlight, foul, save' },
        ],
    },
    {
        title: 'Navigation',
        rows: [
            { keys: ['←', '→'], what: 'Seek 5 s', action: 'seekBack', key: 'ArrowLeft' },
            { keys: ['⇧←', '⇧→'], what: 'Seek 1 s' },
            { keys: ['↑', '↓'], what: 'One frame', action: 'frameForward', key: 'ArrowUp' },
            { keys: ['Home'], what: 'Jump to kick-off (then to the start)', action: 'jumpStart', key: 'Home' },
            { keys: ['End'], what: 'Jump to the end of the file', action: 'jumpEnd', key: 'End' },
            { keys: ['[', ']'], what: 'Previous / next file', action: 'prevFile', key: '[' },
        ],
    },
    {
        title: 'Zoom',
        rows: [
            { keys: ['Z'], what: 'Cycle zoom 1 → 1.5 → 2 → 3 → 4×', action: 'zoomCycle', key: 'z' },
            { keys: ['0'], what: 'Reset zoom', action: 'zoomReset', key: '0' },
        ],
    },
    {
        title: 'Editing',
        rows: [
            { keys: ['L'], what: 'Focus the event list' },
            { keys: ['↑', '↓'], what: 'In the list: select an event' },
            { keys: ['⏎'], what: 'In the list: watch the clip' },
            { keys: ['R'], what: 'In the list: replay on / off' },
            { keys: ['E', 'T', 'N'], what: 'In the list: edit person, team, note' },
            { keys: ['⌫'], what: 'In the list: delete the event' },
            { keys: ['Esc'], what: 'Back to the video' },
            { keys: ['⌘Z', '⇧⌘Z'], what: 'Undo / redo' },
            { keys: ['?'], what: 'This list', action: 'shortcuts', key: '?' },
        ],
    },
]
