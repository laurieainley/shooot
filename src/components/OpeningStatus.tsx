import { useAppState } from '../state'

/** "Opening GX010226.MP4 (11.9 GB)…" with a spinner while picked files are probed. */
export function OpeningStatus() {
    const opening = useAppState((s) => s.opening)
    if (!opening) return null
    return (
        <span role="status" className="opening-status">
            <span className="spinner" aria-hidden="true" />
            <span className="opening-status__text">{opening}</span>
        </span>
    )
}
