import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CloseButton } from './CloseButton'
import { COARSE_QUERY, useMediaQuery } from './useMediaQuery'

interface ThumbnailPreviewProps {
    /** The thumbnail as an image address, taken when the preview opened. */
    src: string
    onClose: () => void
}

/**
 * The thumbnail shown large on a dark backdrop: as big as fits at 16:9 with a margin, edge to edge on touch screens.
 * Esc, the × or a tap on the backdrop closes it, and focus goes back to where it was.
 */
export function ThumbnailPreview({ src, onClose }: ThumbnailPreviewProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null)
    const closeRef = useRef(onClose)
    closeRef.current = onClose
    const fill = useMediaQuery(COARSE_QUERY)

    useEffect(() => {
        const previous = document.activeElement
        dialogRef.current?.focus({ preventScroll: true })
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current() }
        }
        window.addEventListener('keydown', onKey, true)
        return () => {
            window.removeEventListener('keydown', onKey, true)
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
        }
    }, [])

    // Portalled events still bubble through React to the maker (whose arrow keys flip moments), so stop them here.
    return createPortal(
        <div className={`thumb-preview${fill ? ' thumb-preview--fill' : ''}`} onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Thumbnail preview" tabIndex={-1} data-owns-escape className="thumb-preview__dialog">
                <img src={src} alt="The thumbnail, larger" className="thumb-preview__img" onClick={(e) => e.stopPropagation()} />
                <div className="thumb-preview__close" onClick={(e) => e.stopPropagation()}><CloseButton onClick={onClose} label="Close preview" /></div>
            </div>
        </div>,
        document.body,
    )
}
