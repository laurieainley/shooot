import { useEffect } from 'react'
import { keyboardInset } from '../utils/keyboard'

/**
 * Publishes the on-screen keyboard's height as `--kb` on <html>, from `window.visualViewport`, so bottom
 * sheets (event picker, edit sheet, Match setup…) sit above the keyboard with their input and Done in view.
 * The focused field is also scrolled into view inside its sheet once the keyboard has opened.
 */
export function useKeyboardInset(): void {
    useEffect(() => {
        const vv = window.visualViewport
        if (!vv) return
        const root = document.documentElement
        let last = -1
        const update = (): void => {
            const kb = keyboardInset({ layoutHeight: window.innerHeight, viewportHeight: vv.height, viewportOffsetTop: vv.offsetTop })
            if (kb === last) return
            last = kb
            root.style.setProperty('--kb', `${kb}px`)
            root.classList.toggle('kb-open', kb > 0)
            const el = document.activeElement
            if (kb > 0 && el instanceof HTMLElement && el.closest('.event-picker, .sheet, .floating')) {
                requestAnimationFrame(() => el.scrollIntoView?.({ block: 'nearest' }))
            }
        }
        update()
        vv.addEventListener('resize', update)
        vv.addEventListener('scroll', update)
        return () => {
            vv.removeEventListener('resize', update)
            vv.removeEventListener('scroll', update)
            root.style.removeProperty('--kb')
            root.classList.remove('kb-open')
        }
    }, [])
}
