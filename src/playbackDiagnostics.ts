// The app's playback log (see utils/playbackLog.ts): attached to the player's video element, copied from the UI, and fed to the crash report.
import { collectPlaybackEnv, createPlaybackLog, createStuckDetector, formatPlaybackReport, readStoredPlaybackLog, summariseRanges, timeRangesToList, type PlaybackLogData } from './utils/playbackLog'

const storage = (): Storage | undefined => { try { return window.localStorage } catch { return undefined } }

/** What the previous session left behind (read before this session's first write). */
const previous: PlaybackLogData | null = (() => { const s = storage(); return s ? readStoredPlaybackLog(s) : null })()

export const playbackLog = createPlaybackLog({ now: () => Date.now(), storage: storage() })

export const MEDIA_EVENTS = ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'suspend', 'seeking', 'seeked', 'emptied', 'abort', 'error', 'ended', 'ratechange', 'pause', 'play'] as const

/** Logs the element's events (no per-frame work: only these events and one 10 s timer at most). Returns a detach function. */
export function attachPlaybackLogging(video: HTMLMediaElement, hooks: { onEvent?: (name: string) => void } = {}): () => void {
    const stuck = createStuckDetector({
        onStuck: (what) => playbackLog.add({ type: 'stuck', name: what === 'waiting' ? 'STUCK waiting (no playing for 10 s)' : 'STUCK seeking (no seeked for 10 s)', ...state(video) }),
    })
    const handlers = MEDIA_EVENTS.map((name) => {
        const fn = (): void => {
            const err = name === 'error' ? video.error : null
            playbackLog.add({ type: 'event', name, ...(err ? { detail: `MediaError code ${err.code}${err.message ? `: ${err.message}` : ''}` } : name === 'ratechange' ? { detail: `rate ${video.playbackRate}` } : {}), ...state(video) })
            stuck.event(name)
            hooks.onEvent?.(name)
        }
        video.addEventListener(name, fn)
        return [name, fn] as const
    })
    return () => { for (const [n, f] of handlers) video.removeEventListener(n, f); stuck.dispose() }
}

function state(v: HTMLMediaElement) {
    return { currentTime: v.currentTime, readyState: v.readyState, networkState: v.networkState, buffered: summariseRanges(timeRangesToList(v.buffered)) }
}

/** The report for the user to paste: this session's log, or the previous session's when this one has nothing yet. */
export function playbackReportText(): string {
    const cur = playbackLog.data()
    const useCur = cur.entries.length > 0 || cur.sources.length > 0
    const text = formatPlaybackReport(useCur ? cur : previous ?? cur, collectPlaybackEnv())
    return useCur || !previous ? text : `${text}\n\n(previous session's log; nothing played in this one yet)`
}

/** For the crash note: the log the crashed session left (always the previous one). */
export function previousPlaybackReportText(): string {
    return previous ? formatPlaybackReport(previous, collectPlaybackEnv()) : 'No playback log was saved.'
}
