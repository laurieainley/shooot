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
