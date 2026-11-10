// A hand-off between the export buttons and the background preparer, so that the code that starts an export need not import the preparer
// (which imports the export code). The app registers the preparer's controls when it starts; without it everything here does nothing.
export type PreparerControl = {
    hold: (why?: 'parts') => () => void
    idle: () => Promise<void>
    totals: (kind: 'fullMatch' | 'highlights') => { wallMs: number; unitsEncoded: number; encodedSec: number; pausedMs: number; throttledMs: number }
    /** The cache changed under the preparer (a prepared parts file was loaded): plan again now, so the Export panel's time hint counts the new parts. */
    refresh: () => void
}

let control: PreparerControl | null = null
export function registerPreparerControl(c: PreparerControl | null): void { control = c }

/** Stops the preparer now (call inside the click that starts an export). `idle` resolves when its pass has really stopped; `release` lets it carry on. */
export function holdPreparer(why?: 'parts'): { idle: Promise<void>; release: () => void } {
    const release = control?.hold(why) ?? (() => undefined)
    return { idle: control?.idle() ?? Promise.resolve(), release }
}

export function preparerTotals(kind: 'fullMatch' | 'highlights'): ReturnType<PreparerControl['totals']> | null { return control?.totals(kind) ?? null }

/** A prepared parts file was loaded: the preparer looks at its plans again at once (it counts the loaded parts as ready). */
export function refreshPreparer(): void { control?.refresh() }
