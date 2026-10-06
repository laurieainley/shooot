import { useAppState } from '../state'

/** "Opening GX010226.MP4 (11.9 GB)…" with a spinner while picked files are probed; iPadOS waiting and large-file notes. */
export function OpeningStatus() {
    const opening = useAppState((s) => s.opening)
    const waiting = useAppState((s) => s.pickerWait)
    const notice = useAppState((s) => s.pickerNotice)
    const text = opening ?? (waiting ? 'Waiting for iPadOS to hand over the files…' : null)
    return (
        <>
            {text && (
                <span role="status" className="opening-status">
                    <span className="spinner" aria-hidden="true" />
                    <span className="opening-status__text">{text}</span>
                </span>
            )}
            {notice && <span className="picker-notice">{notice}</span>}
        </>
    )
}
