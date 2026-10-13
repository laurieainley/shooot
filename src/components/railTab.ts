// Which tab the right-hand rail shows. UI state only (not persisted).
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export type RailTab = 'events' | 'matches'

export const railTabStore = createStore<{ tab: RailTab }>(() => ({ tab: 'events' }))

export function setRailTab(tab: RailTab): void { railTabStore.setState({ tab }) }

export function useRailTab(): RailTab { return useStore(railTabStore, (s) => s.tab) }
