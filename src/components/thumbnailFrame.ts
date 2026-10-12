import { useEffect, useState } from 'react'
import { grabFrame } from './frameGrab'

export type ThumbFrame = { status: 'idle' | 'loading' | 'ready' | 'error'; image: HTMLImageElement | null }

const decode = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('could not decode the frame'))
        img.src = src
    })

/**
 * A still of one of `urls` at `atSec` (the first that can show it: the full-quality file, then the one playing), as a
 * decoded image. The previous still stays up while the next one loads. Null urls / time do nothing.
 */
export function useThumbFrame(urls: string[], atSec: number | null, maxWidth: number): ThumbFrame {
    const [state, setState] = useState<ThumbFrame & { key: string }>({ status: 'idle', image: null, key: '' })
    const key = atSec !== null && urls.length > 0 ? `${urls.join('|')}@${Math.round(atSec * 100)}@${maxWidth}` : ''
    useEffect(() => {
        if (!key || atSec === null) return
        let live = true
        void (async () => {
            for (const url of urls) {
                try {
                    const frame = await grabFrame(url, atSec, maxWidth)
                    const image = await decode(frame.src)
                    if (live) setState({ status: 'ready', image, key })
                    return
                } catch { /* try the next file */ }
            }
            if (live) setState((s) => ({ status: 'error', image: s.image, key }))
        })()
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    if (!key) return { status: 'idle', image: null }
    return state.key === key ? { status: state.status, image: state.image } : { status: 'loading', image: state.image }
}
