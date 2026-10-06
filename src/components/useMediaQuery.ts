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

/** A touch tablet: coarse pointer and at least 600px in both directions (a phone on its side is too short). */
export const TABLET_QUERY = '(pointer: coarse) and (min-width: 600px) and (min-height: 600px)'
export const PORTRAIT_QUERY = '(orientation: portrait)'

/**
 * desktop  - the edit bay: player + strip left, events rail right (wide screens, touch tablets on their side)
 * landscape - the same bay under a compact top bar (a phone on its side)
 * tablet   - a touch tablet held upright: player on top, strip, events below in their own scroll region
 * phone    - portrait phone: stacked, the page scrolls
 */
export type Layout = 'desktop' | 'landscape' | 'phone' | 'tablet'

export interface LayoutFlags {
    landscapePhone: boolean
    tablet: boolean
    portrait: boolean
    desktop: boolean
}

/** Short landscape wins over width, so a 915x412 phone is not treated as a desktop; tablets only stack upright. */
export function pickLayout({ landscapePhone, tablet, portrait, desktop }: LayoutFlags): Layout {
    if (landscapePhone) return 'landscape'
    if (tablet) return portrait ? 'tablet' : 'desktop'
    return desktop ? 'desktop' : 'phone'
}

export function useLayout(): Layout {
    const desktop = useMediaQuery(DESKTOP_QUERY)
    const landscapePhone = useMediaQuery(LANDSCAPE_QUERY)
    const tablet = useMediaQuery(TABLET_QUERY)
    const portrait = useMediaQuery(PORTRAIT_QUERY)
    return pickLayout({ landscapePhone, tablet, portrait, desktop })
}
