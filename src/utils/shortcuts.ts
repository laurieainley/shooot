export type ShortcutAction =
    | 'playPause' | 'seekBack' | 'seekForward' | 'seekBackFine' | 'seekForwardFine'
    | 'frameForward' | 'frameBack' | 'mark' | 'mute' | 'fullscreen'
    | 'zoomCycle' | 'zoomReset' | 'speedDown' | 'speedUp' | 'speedReset'
    | 'jumpStart' | 'jumpEnd' | 'prevFile' | 'nextFile'

export type ShortcutKey = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>

/** The player action a key stands for, wherever focus is (null = not a player shortcut). Browser / OS combos never match. */
export function shortcutFor(e: ShortcutKey): ShortcutAction | null {
    if (e.ctrlKey || e.metaKey || e.altKey) return null
    switch (e.key) {
        case ' ': return 'playPause'
        case 'ArrowLeft': return e.shiftKey ? 'seekBackFine' : 'seekBack'
        case 'ArrowRight': return e.shiftKey ? 'seekForwardFine' : 'seekForward'
        case 'ArrowUp': return 'frameForward'
        case 'ArrowDown': return 'frameBack'
        case 'Home': return 'jumpStart'
        case 'End': return 'jumpEnd'
        case 'g': case 'G': return 'mark'
        case 'm': case 'M': return 'mute'
        case 'f': case 'F': return 'fullscreen'
        case 'z': case 'Z': return 'zoomCycle'
        case '0': return 'zoomReset'
        case ',': return 'speedDown'
        case '.': return 'speedUp'
        case '/': return 'speedReset'
        case '[': return 'prevFile'
        case ']': return 'nextFile'
        default: return null
    }
}

export type ShortcutContext = {
    /** The event picker or a sheet / panel is open: it has its own keys. */
    modalOpen: boolean
}

const TEXT_ROLES = ['textbox', 'searchbox', 'combobox', 'spinbutton', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab']
const PLAIN_INPUTS = ['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image']

/**
 * Whether a key pressed with focus on `target` may run a player shortcut: anywhere (body, video, buttons, the strip,
 * the event log) except in text fields, selects, range inputs, menus and tabs, or while a sheet / the picker is open.
 */
export function shouldHandleShortcut(target: EventTarget | null, ctx: ShortcutContext): boolean {
    if (ctx.modalOpen) return false
    const el = target as Element | null
    if (!el || typeof el.closest !== 'function') return true
    if ((el as HTMLElement).isContentEditable) return false
    const tag = el.tagName
    if (tag === 'TEXTAREA' || tag === 'SELECT') return false
    if (tag === 'INPUT') return PLAIN_INPUTS.includes((el as HTMLInputElement).type)
    const role = el.getAttribute('role')
    if (role && TEXT_ROLES.includes(role)) return false
    return !el.closest('[role="menu"], [role="dialog"], [aria-modal="true"], [contenteditable=""], [contenteditable="true"]')
}
