// Chrome's save-file picker (desktop Chrome / Edge): the export can be written straight into a file the user picks.

type SavePickerWindow = { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }

export const hasSavePicker = (): boolean => typeof (globalThis as SavePickerWindow).showSaveFilePicker === 'function'

/** Asks where to save the MP4. Call it inside the click (before any await). Null when the user cancels the picker. */
export async function pickSaveFile(suggestedName: string): Promise<FileSystemFileHandle | null> {
    try {
        return await (globalThis as SavePickerWindow).showSaveFilePicker!({ suggestedName, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] })
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null
        throw e
    }
}
