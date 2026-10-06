import { useEffect, useState } from 'react'
import { useAppState } from '../state'
import { buildTransferPayload, encodeProject, qrIsDense, transferUrl } from '../utils/projectTransfer'
import { Sheet } from './Sheet'

interface SendProjectSheetProps {
    onClose: () => void
}

/** Project → link (and QR) for another device. Only events and settings travel; videos are relinked there by name. */
export function SendProjectSheet({ onClose }: SendProjectSheetProps) {
    const [link, setLink] = useState<string | null>(null)
    const [qr, setQr] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        void (async () => {
            const url = transferUrl(window.location.origin, await encodeProject(buildTransferPayload(useAppState.getState())))
            if (!live) return
            setLink(url)
            try {
                const { default: QRCode } = await import('qrcode')
                const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'L' })
                if (live) setQr(svg)
            } catch { if (live) setQr('') } // too long for a QR code: Share and Copy still work
        })()
        return () => { live = false }
    }, [])

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    const copy = async (): Promise<void> => {
        if (!link) return
        try { await navigator.clipboard.writeText(link); setStatus('Link copied') } catch { setStatus('Could not copy: select the link and copy it by hand') }
    }
    const share = async (): Promise<void> => {
        if (!link) return
        try { await navigator.share({ url: link }) } catch { /* cancelled */ }
    }

    return (
        <Sheet label="Send project to another device" onClose={onClose} className="sheet--narrow">
            <div className="send-sheet">
                <p className="m-0 text-muted">
                    Scan the code with the other device’s camera, or send it the link. Only the events and settings travel,
                    not the video. Pick the same videos there and the events find them by name.
                </p>
                {link === null && <p role="status" className="m-0 text-muted">Making the link…</p>}
                {qr && <div className="send-sheet__qr" role="img" aria-label="QR code of the project link" dangerouslySetInnerHTML={{ __html: qr }} />}
                {link !== null && (
                    <>
                        <input readOnly aria-label="Project link" value={link} className="send-sheet__link" onFocus={(e) => e.currentTarget.select()} />
                        <p className="m-0 text-muted">
                            {link.length.toLocaleString('en')} characters.
                            {qrIsDense(link) && ' This project is too big for a reliable QR code: Share or Copy is more reliable.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {canShare && <button type="button" className="btn-primary" onClick={() => void share()}>Share…</button>}
                            <button type="button" className={canShare ? 'btn-quiet' : 'btn-primary'} onClick={() => void copy()}>Copy link</button>
                        </div>
                        {status && <p role="status" className="m-0 text-muted">{status}</p>}
                    </>
                )}
            </div>
        </Sheet>
    )
}
