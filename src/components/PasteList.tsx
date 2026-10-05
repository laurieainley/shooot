import { useState } from 'react'
import { useAppState } from '../state'
import { parseBulkPaste } from '../utils/bulkPaste'

/** Paste a list of events ("07:12 Whites - Sam", one per line); they are added to the current file in one undo step. */
export function PasteList() {
    const [text, setText] = useState('')

    const add = (): void => {
        const st = useAppState.getState()
        st.addEvents(parseBulkPaste(text, st.currentFileIndex))
        st.closePanel()
    }

    return (
        <div className="flex flex-col gap-2 py-3">
            <textarea
                aria-label="Paste list"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'07:12 Whites - Sam\n23:41 Colours - Jo'}
                className="field tc h-32 resize-y text-[13px]"
            />
            <div className="flex gap-2">
                <button type="button" onClick={add} disabled={!text.trim()} className="btn-primary">Add events</button>
                <button type="button" onClick={() => useAppState.getState().closePanel()} className="btn-quiet">Cancel</button>
            </div>
        </div>
    )
}
