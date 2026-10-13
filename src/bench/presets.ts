// One-tap setups for /bench: which stages and experiments each of the three test devices should run.
import type { ExperimentId, StageId } from './results'

export type PresetId = 'ipad' | 'pixel' | 'mac'

export type Preset = {
    id: PresetId
    label: string
    stages: StageId[]
    experiments: ExperimentId[]
    /** Time the save step after each stage. */
    deliver: boolean
    /** Experiments whose results matter most on this device (shown first / flagged). */
    highlight: ExperimentId[]
    /** One line: which file to pick and about how long the run takes. */
    instruction: string
}

export const BENCH_FILE = 'bench-gopro-4k.mp4'

/** Every experiment, in the brief's numbering (1-7, 9, 10; 8, HEVC output, is deliberately not here). */
export const ALL_EXPERIMENTS: ExperimentId[] = ['parallel', 'segmentCache', 'playback', 'directSave', 'overlayCache', 'tightSpans', 'latency', 'pipeline', 'worker']

/** Experiment 4 writes to a file the user picks with the browser's save dialog, which phones and iPads do not have. */
const MOBILE_EXPERIMENTS = ALL_EXPERIMENTS.filter((e) => e !== 'directSave')

export const PRESETS: Record<PresetId, Preset> = {
    ipad: {
        id: 'ipad', label: 'iPad', stages: ['reencode1080'], experiments: MOBILE_EXPERIMENTS, deliver: true, highlight: [],
        instruction: `Pick ${BENCH_FILE}, then Start. About 30-40 minutes; keep the screen on. (Direct save is not supported here: only the save-step cost is reported.)`,
    },
    pixel: {
        id: 'pixel', label: 'Pixel', stages: ['reencode1080'], experiments: MOBILE_EXPERIMENTS, deliver: true, highlight: ['overlayCache', 'tightSpans'],
        instruction: `Pick ${BENCH_FILE}, then Start. About 30-40 minutes; keep the screen on. (Direct save is not supported here: only the save-step cost is reported.)`,
    },
    mac: {
        id: 'mac', label: 'Mac', stages: ['reencode1080', 'reencode4k'], experiments: ALL_EXPERIMENTS, deliver: true, highlight: [],
        instruction: `Pick ${BENCH_FILE}, then Start. About 20-25 minutes; you will be asked where to save a file first (experiment 4).`,
    },
}

/** The preset that most likely matches this browser, or null when it is none of the three. Never applied automatically. */
export function detectPreset(env: { userAgent: string; platform?: string; maxTouchPoints?: number }): PresetId | null {
    const ua = env.userAgent
    if (/iPad|iPhone|iPod|CriOS|FxiOS|EdgiOS/.test(ua)) return 'ipad'
    // iPadOS asks for desktop sites by default: it reports a Mac with a touch screen.
    if (/Macintosh|MacIntel/.test(`${ua} ${env.platform ?? ''}`) && (env.maxTouchPoints ?? 0) > 1) return 'ipad'
    if (/Android/.test(ua)) return 'pixel'
    if (/Macintosh|Mac OS X|MacIntel/.test(`${ua} ${env.platform ?? ''}`)) return 'mac'
    return null
}
