// "Export without prepared parts": a one-shot switch (⋯ menu) that makes the NEXT export run with the unit cache off, so its timing in the
// export log can be compared with a normal export of the same edit. Kept for the session only; taking it clears it.
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export const baselineStore = createStore<{ next: boolean }>(() => ({ next: false }))

export const setBaseline = (on: boolean): void => baselineStore.setState({ next: on })
/** True once if the next export is the baseline run; clears the switch. */
export function takeBaseline(): boolean {
    const on = baselineStore.getState().next
    if (on) baselineStore.setState({ next: false })
    return on
}
export const useBaseline = (): boolean => useStore(baselineStore, (s) => s.next)
