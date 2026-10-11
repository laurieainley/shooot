/** Every tunable of audio goal suggestions (spec: docs/superpowers/specs/2026-10-11-suggested-goals-design.md). Bump `version` when a value changes. */
export const AUDIO_DETECT = {
    version: 2,
    hopSec: 0.2,
    smoothSec: 1,
    voiceHz: [300, 3000] as readonly [number, number],
    peakWindowSec: [-3, 3] as readonly [number, number],
    hushWindowSec: [5, 15] as readonly [number, number],
    minGapSec: 20,
    /** Shortlist size scales with the analysed length: count = clamp(round(maxPerHour × hours), minSuggestions, maxSuggestionsCap). */
    maxPerHour: 45,
    minSuggestions: 10,
    maxSuggestionsCap: 60,
    eventOffsetSec: -2,
    reviewWindowSec: [-5, 2] as readonly [number, number],
    lowKeepRatio: 0.15,
} as const

export type AudioDetectConfig = typeof AUDIO_DETECT
