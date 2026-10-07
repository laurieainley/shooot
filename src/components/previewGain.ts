// Where the browser ignores `HTMLMediaElement.volume` (iOS / iPadOS), the preview's quieter replays go through a
// Web Audio gain node instead, so the preview is as loud as the render on every device.

type Graph = { gain: GainNode; ctx: AudioContext }
const graphs = new WeakMap<HTMLMediaElement, Graph>()

/** False where setting `volume` has no effect (iOS). */
export function volumeIsSettable(el: HTMLMediaElement): boolean {
    const old = el.volume
    try {
        el.volume = old === 0.5 ? 0.25 : 0.5
        const ok = el.volume !== old
        el.volume = old
        return ok
    } catch {
        return false
    }
}

function graphFor(el: HTMLMediaElement): Graph | null {
    const known = graphs.get(el)
    if (known) return known
    try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return null
        const ctx = new Ctx()
        const gain = ctx.createGain()
        ctx.createMediaElementSource(el).connect(gain)
        gain.connect(ctx.destination)
        const graph = { gain, ctx }
        graphs.set(el, graph)
        return graph
    } catch {
        return null
    }
}

/**
 * Make the preview audio `level` (0–1) of the element's own level where `volume` can't do it. Returns false when
 * the element's volume works (the caller sets it) or there is no Web Audio. `level` 1 on an element never routed does nothing.
 */
export function setGraphGain(el: HTMLMediaElement, level: number): boolean {
    if (volumeIsSettable(el)) {
        const g = graphs.get(el)
        if (g) g.gain.gain.value = 1
        return false
    }
    if (level >= 1 && !graphs.has(el)) return false
    const graph = graphFor(el)
    if (!graph) return false
    graph.gain.gain.value = level
    void graph.ctx.resume().catch(() => undefined)
    return true
}
