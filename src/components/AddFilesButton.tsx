import { useRef } from 'react'
import { useAppState } from '../state'
import { acceptAttr } from '../utils/fileAccept'
import { notePicked, openMediaPicker } from './pickerStatus'
import { addPickedFiles } from './addFiles'
import { filePicker, pickWithHandles } from '../files/handleStore'

interface AddFilesButtonProps {
    label?: string
    className?: string
    onError?: (message: string | null) => void
}

export function AddFilesButton({ label = '+ files', className = 'file-add', onError }: AddFilesButtonProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const busy = useAppState((s) => s.opening !== null)
    return (
        <>
            <button type="button" disabled={busy} className={className} onClick={async () => {
                // Desktop Chrome / Edge: the system picker gives handles we keep, so a reload can relink in one click.
                if (filePicker()) {
                    try {
                        const files = await pickWithHandles()
                        if (files) {
                            const error = await addPickedFiles(files)
                            onError?.(error)
                        }
                        return
                    } catch { /* fall back to the plain input */ }
                }
                if (inputRef.current) openMediaPicker(inputRef.current)
            }}>{label}</button>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={acceptAttr()}
                onChange={async (evt) => {
                    const picked = Array.from(evt.target.files ?? [])
                    notePicked(picked)
                    evt.target.value = ''
                    const error = await addPickedFiles(picked)
                    onError?.(error)
                }}
                className="hidden"
            />
        </>
    )
}
