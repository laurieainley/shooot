// Black stretches in the editor recordings (the player reloading between files), skipped on playback so the
// browser frame never shows a black picture. Measured with:
//   ffmpeg -i <capture>.mp4 -vf "crop=1400:800:60:150,blackdetect=d=0.05:pix_th=0.08" -an -f null -
// Re-measure if the captures are re-recorded.
export const CAPTURE_GAPS: Record<string, [number, number][]> = {
    'capture/c-scrub-montage.mp4': [[4.8, 5.44], [6.53, 7.27], [8.83, 9.2]],
    'capture/a-drop-files.mp4': [[4.47, 5.97]],
}

/** Maps playback time onto source time, jumping over the gaps (a jump cut). */
export function skipGaps(file: string, t: number): number {
    let s = t
    for (const [a, b] of CAPTURE_GAPS[file] ?? []) if (s >= a) s += b - a
    return s
}
