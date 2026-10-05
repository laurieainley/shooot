// Desktop notification when a long render finishes while the tab is hidden.

const FINE = '(pointer: fine)'
const hasApi = (): boolean => typeof window !== 'undefined' && 'Notification' in window

/** Asks once (first long render, desktop only); must be called from the click that starts the render. */
export function askNotifyPermission(): void {
    if (!hasApi() || Notification.permission !== 'default') return
    if (typeof window.matchMedia === 'function' && !window.matchMedia(FINE).matches) return
    void Notification.requestPermission().catch(() => undefined)
}

/** Shows a notification if the page is hidden and notifications are allowed. Returns whether one was shown. */
export function notifyIfHidden(title: string, body: string): boolean {
    if (!hasApi() || Notification.permission !== 'granted' || document.visibilityState !== 'hidden') return false
    try {
        const n = new Notification(title, { body, icon: '/favicon.svg' })
        n.onclick = () => { window.focus(); n.close() }
        return true
    } catch {
        return false
    }
}
