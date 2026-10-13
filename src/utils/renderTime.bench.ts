// The device benchmarks the cost model is fitted to (wall time / output length), and the plans they ran. Data for
// renderTime.test.ts; not imported by the app.
import type { DeviceClass, SourceFacts, WorkInput } from './renderTime'
import type { OutputQuality } from '../render/transcodePlan'

const facts = (width: number, height: number, codec: SourceFacts['codec'], mbps: number): SourceFacts => ({ width, height, codec, fps: 30, bytesPerSec: (mbps * 1e6) / 8 })

/** The four test sources: raw GoPro 4K HEVC 90 Mbps, GoPro 1080p HEVC 40 Mbps, Handbrake 4K H.264 7.5 Mbps, Pixel 4K HEVC 42 Mbps. */
export const BENCH_SOURCES = {
    gopro4k: facts(3840, 2160, 'hevc', 90),
    gopro1080: facts(1920, 1080, 'hevc', 40),
    handbrake4k: facts(3840, 2160, 'h264', 7.5),
    pixel4k: facts(3840, 2160, 'hevc', 42),
}
export type BenchSource = keyof typeof BENCH_SOURCES

/** A match with no graphics: one long cut (copy and plain re-encode). */
export const PLAIN_PLAN: WorkInput = { cuts: [{ startSec: 0, endSec: 600 }], overlays: [], introSec: 0, outroSec: 0 }

/**
 * The 80 s highlights run: 6 clips of 8 s with a 5 s caption each, 3 slow-mo (0.5x) replays of 4 s with the replay tag, a title and a
 * full-time card of 4 s.
 */
export const HIGHLIGHTS_PLAN: WorkInput = (() => {
    const cuts: WorkInput['cuts'] = []
    const overlays: WorkInput['overlays'] = []
    for (let i = 0; i < 6; i++) {
        cuts.push({ startSec: 100 * i, endSec: 100 * i + 8 })
        overlays.push({ cutIndex: cuts.length - 1, startSec: 100 * i + 2, durationSec: 5 })
        if (i % 2 === 0) {
            cuts.push({ startSec: 100 * i + 4, endSec: 100 * i + 8, speed: 0.5 })
            overlays.push({ cutIndex: cuts.length - 1, startSec: 100 * i + 4, durationSec: 4, whole: true })
        }
    }
    return { cuts, overlays, introSec: 4, outroSec: 4 }
})()

export type Measurement = { device: DeviceClass; what: string; plan: 'plain' | 'highlights'; output: OutputQuality; source: BenchSource; ratio: number }

const m = (device: DeviceClass, what: string, plan: Measurement['plan'], output: OutputQuality, source: BenchSource, ratio: number): Measurement => ({ device, what, plan, output, source, ratio })
const S: BenchSource[] = ['gopro4k', 'gopro1080', 'handbrake4k', 'pixel4k']

export const MEASUREMENTS: Measurement[] = [
    // Pixel (Android Chrome)
    ...[0.57, 0.27, 0.06, 0.19].map((r, i) => m('android', 'copy', 'plain', 'original', S[i], r)),
    ...[2.2, 1.0, 1.5, 2.0].map((r, i) => m('android', 'highlights original', 'highlights', 'original', S[i], r)),
    ...[1.02, 0.5, 0.82, 0.91].map((r, i) => m('android', 'highlights 1080p', 'highlights', '1080p', S[i], r)),
    ...([[1.25, 0], [1.11, 2], [0.97, 3]] as const).map(([r, i]) => m('android', 'highlights 4K', 'highlights', '4k', S[i], r)),
    // iPad (WebKit)
    ...[0.13, 0.05, 0.01, 0.05].map((r, i) => m('ipad', 'copy', 'plain', 'original', S[i], r)),
    ...[0.42, 0.14, 0.38, 0.4].map((r, i) => m('ipad', 'highlights original', 'highlights', 'original', S[i], r)),
    ...([[0.84, 0], [0.8, 2], [0.85, 3]] as const).map(([r, i]) => m('ipad', 'plain 4K', 'plain', '4k', S[i], r)),
    ...[0.18, 0.15, 0.16, 0.16].map((r, i) => m('ipad', 'plain 1080p', 'plain', '1080p', S[i], r)),
    // Mac Chrome
    m('desktop', 'plain 4K', 'plain', '4k', 'gopro4k', 0.85), m('desktop', 'plain 4K', 'plain', '4k', 'handbrake4k', 0.78), m('desktop', 'plain 4K', 'plain', '4k', 'pixel4k', 0.83),
    m('desktop', 'plain 1080p', 'plain', '1080p', 'gopro4k', 0.68), m('desktop', 'plain 1080p', 'plain', '1080p', 'handbrake4k', 0.55), m('desktop', 'plain 1080p', 'plain', '1080p', 'pixel4k', 0.58), m('desktop', 'plain 1080p', 'plain', '1080p', 'gopro1080', 0.37),
    m('desktop', 'highlights original', 'highlights', 'original', 'gopro1080', 0.46),
    m('desktop', 'copy', 'plain', 'original', 'gopro1080', 0.1),
]
