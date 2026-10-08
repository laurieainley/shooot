export type AudioFormat = { codec: string | null; sampleRate: number; numberOfChannels: number }

/**
 * Decides the audio track of a reel from the audio of each clip's source (null = no audio track). Clips share one
 * audio format; sources without audio are allowed and get silence. `reference` is the index of the first source with audio.
 */
export function planAudio(formats: (AudioFormat | null)[]): { ok: true; reference: number | null } | { ok: false } {
    const withAudio = formats.map((f, i) => [f, i] as const).filter((x): x is readonly [AudioFormat, number] => x[0] !== null)
    if (withAudio.length === 0) return { ok: true, reference: null }
    const id = (f: AudioFormat): string => `${f.codec}/${f.sampleRate}/${f.numberOfChannels}`
    if (new Set(withAudio.map(([f]) => id(f))).size > 1) return { ok: false }
    return { ok: true, reference: withAudio[0][1] }
}
