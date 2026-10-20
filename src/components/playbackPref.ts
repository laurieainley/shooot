// The Playback choice (LRV or MP4 for GoPro pairs): per device in localStorage `shooot-playback`, outside `vhm-state`.
import { create } from 'zustand'
import { useAppState } from '../state'
import { showToast } from '../toasts'
import { defaultPlaybackPref, parsePlaybackPref, type PlaybackPref } from '../utils/playbackSource'
import { switchBlocker } from './matchSwitch'

const KEY = 'shooot-playback'

function isTouch(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/** The saved choice, or the device default (LRV on touch layouts, MP4 with a mouse). */
export function readPlaybackPref(): PlaybackPref {
    try {
        const saved = parsePlaybackPref(localStorage.getItem(KEY))
        if (saved) return saved
    } catch { /* storage blocked: use the default */ }
    return defaultPlaybackPref(isTouch())
}

function save(pref: PlaybackPref): void {
    try { localStorage.setItem(KEY, pref) } catch { /* not saved: still applies this session */ }
}

const usePref = create<{ pref: PlaybackPref }>(() => ({ pref: readPlaybackPref() }))

export function usePlaybackPref(): PlaybackPref {
    return usePref((s) => s.pref)
}

export const currentPlaybackPref = (): PlaybackPref => usePref.getState().pref

export const MP4_FALLBACK_TOAST = "This device can't play the MP4 — playing the LRV."

/** Why the switch is off right now (an export or Find goals holds the files), or null. */
export function playbackLocked(): string | null {
    const b = switchBlocker()
    return b ? (b === 'render' ? 'Not while exporting.' : 'Not while Find goals runs.') : null
}

/** Saves the choice and switches every paired file. False when a running job blocks it. */
export function choosePlayback(pref: PlaybackPref): boolean {
    if (switchBlocker()) return false
    usePref.setState({ pref })
    save(pref)
    const r = useAppState.getState().applyPlayback(pref)
    if (r.fellBack) showToast(MP4_FALLBACK_TOAST)
    return true
}

/** The player failed on the MP4 of a pair: play the LRV for that file and say so. */
export function mp4FailedToPlay(index: number, reason = "The player couldn't play the MP4"): void {
    if (useAppState.getState().fallBackToLrv(index, reason)) showToast(MP4_FALLBACK_TOAST)
}

