interface ZoomChipProps {
    zoom: number
    onReset: () => void
}

/** Shows the zoom level while zoomed in; click (or 0) returns to 1×. */
export function ZoomChip({ zoom, onReset }: ZoomChipProps) {
    if (zoom <= 1) return null
    const label = `${Math.round(zoom * 10) / 10}×`
    return (
        <button type="button" className="zoom-chip" onClick={onReset} title="Reset zoom (0)" aria-label={`Zoom ${label}, reset`}>
            {label}
        </button>
    )
}
