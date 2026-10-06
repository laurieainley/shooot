import { useAppState } from '../state'
import { onIOS } from '../utils/fileAccept'
import { largeFileHint } from '../utils/pickerHint'

/**
 * Opens a hidden file input. On iPadOS the picker is slow to hand large files over, so the waiting state
 * is shown from here until `change` (see `notePicked`) or `cancel` fires.
 */
export function openMediaPicker(input: HTMLInputElement): void {
    if (onIOS()) {
        useAppState.getState().setPicker({ wait: true, notice: null })
        input.addEventListener('cancel', () => useAppState.getState().setPicker({ wait: false }), { once: true })
    }
    input.click()
}

/** Call first thing in a file input's change handler: ends the wait and shows the iPad large-file hint if needed. */
export function notePicked(files: File[]): void {
    useAppState.getState().setPicker({ wait: false, notice: largeFileHint(onIOS(), files.map((f) => f.size)) })
}
