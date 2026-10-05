import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
    const get = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
    const [matches, setMatches] = useState(get)
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return
        const mq = window.matchMedia(query)
        const onChange = (): void => setMatches(mq.matches)
        onChange()
        mq.addEventListener?.('change', onChange)
        return () => mq.removeEventListener?.('change', onChange)
    }, [query])
    return matches
}

export const DESKTOP_QUERY = '(min-width: 900px)'

/** Touch screens: no hover, fat fingers, no keyboard shortcuts. */
export const COARSE_QUERY = '(pointer: coarse)'

/** A phone on its side: too short for the stacked phone layout, whatever its width (844×390, 915×412…). */
export const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)'

export type Layout = 'desktop' | 'landscape' | 'phone'

/** Edit-bay layout: short landscape wins over width, so a 915×412 phone is not treated as a desktop. */
export function useLayout(): Layout {
    const desktop = useMediaQuery(DESKTOP_QUERY)
    const landscape = useMediaQuery(LANDSCAPE_QUERY)
    return landscape ? 'landscape' : desktop ? 'desktop' : 'phone'
}
