import { useState } from 'react'
import { useAppState } from '../state'
import { ImportProjectFile } from './ImportProjectFile'
import { PasteList } from './PasteList'
import { Sheet } from './Sheet'

/** ⋯ → Import…: a project file on the left, pasted goal times on the right (stacked on phones, file first). */
export function ImportModal() {
    const [text, setText] = useState('')
    const close = (): void => useAppState.getState().closePanel()
    const pasting = text.trim().length > 0
    return (
        <Sheet label="Import" onClose={close} className="sheet--import">
            <div className="import-grid">
                <ImportProjectFile primary={!pasting} onDone={close} />
                <PasteList text={text} onText={setText} primary={pasting} onDone={close} />
            </div>
        </Sheet>
    )
}
