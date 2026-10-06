// The same stream can be described with either MP4 sample-entry name (hev1/hvc1, avc1/avc3), and browsers
// disagree on which they answer for: Safari says '' for GoPro's reported "hev1…" yet plays the file. Ask with
// both spellings; the real playability check is loading the file in a <video> (see probe.ts).
const SWAPS: Record<string, string> = { hev1: 'hvc1', hvc1: 'hev1', avc1: 'avc3', avc3: 'avc1' }

export function codecStringVariants(codecString: string): string[] {
    const prefix = codecString.slice(0, 4)
    const swap = SWAPS[prefix]
    return swap ? [codecString, swap + codecString.slice(4)] : [codecString]
}
