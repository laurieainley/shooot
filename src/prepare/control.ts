// A hand-off between the export buttons and the background preparer, so that the code that starts an export need not import the preparer
// (which imports the export code). The app registers the preparer's controls when it starts; without it everything here does nothing.
export type PreparerControl = {
    hold: () => () => void
    idle: () => Promise<void>
    totals: (kind: 'fullMatch' | 'highlights') => { wallMs: number; unitsEncoded: number; encodedSec: number; pausedMs: number; throttledMs: number }
}

let control: PreparerControl | null = null
export function registerPreparerControl(c: PreparerControl | null): void { control = c }

/** Stops the preparer now (call inside the click that starts an export). `idle` resolves when its pass has really stopped; `release` lets it carry on. */
export function holdPreparer(): { idle: Promise<void>; release: () => void } {
    const release = control?.hold() ?? (() => undefined)
    return { idle: control?.idle() ?? Promise.resolve(), release }
}

export function preparerTotals(kind: 'fullMatch' | 'highlights'): ReturnType<PreparerControl['totals']> | null { return control?.totals(kind) ?? null }
