// One toast at a time, kept outside the UI (like detectJobs.ts): any action can announce itself.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export interface ToastAction { label: string; run: () => void }
export interface ToastItem { id: number; text: string; action?: ToastAction; secondary?: ToastAction }
export interface ToastState { toast: ToastItem | null }

/** How long a toast stays (paused while hovered or focused). */
export const TOAST_MS = 4000

let nextId = 1
export const toastStore = createStore<ToastState>(() => ({ toast: null }))

/** Show a plain confirmation, replacing the current toast. Returns its id. */
export function showToast(text: string, action?: ToastAction, secondary?: ToastAction): number {
    const id = nextId++
    toastStore.setState({ toast: { id, text, ...(action ? { action } : {}), ...(secondary ? { secondary } : {}) } })
    return id
}

/** Hide the toast (only that one when an id is given, so a late timer can't close a newer toast). */
export function dismissToast(id?: number): void {
    const cur = toastStore.getState().toast
    if (cur && (id === undefined || cur.id === id)) toastStore.setState({ toast: null })
}

export function useToast(): ToastItem | null {
    return useStore(toastStore, (s) => s.toast)
}
