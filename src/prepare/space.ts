// Disk-space check for the background preparer: will the prepared parts of an export fit, and what to tell the user when they don't. Pure.
import { formatBytes } from '../utils/fullMatch'

/** The engine's own rule of thumb: an export that builds its file in browser storage holds its unit logs and the file at once (render/transcodeEngine). */
export const OUTPUT_MARGIN = 2.2

export type SpaceInput = {
    /** 'full match' | 'highlights' */
    what: string
    /** '4K' | '1080p' */
    qualityLabel: string
    /** Bytes the prepared parts of this kind will take. */
    needBytes: number
    /** Parts of other kinds already admitted (they live in the same storage). */
    committedBytes: number
    /** Room the export itself needs next to them: 0 when it saves straight to a file, else OUTPUT_MARGIN × the parts. */
    marginBytes: number
    /** What the site's storage can hold for them (free space plus the cache, which is reclaimable); null = the browser won't say. */
    availableBytes: number | null
    /** A smaller quality to suggest, and what its parts would take. */
    alternative?: { label: string; needBytes: number } | null
}

export type SpaceVerdict = { fits: boolean; neededBytes: number; availableBytes: number | null; message: string | null }

/** The marginal room the export needs: none when it saves to a file (only the cache lives in browser storage), else its unit logs and file. */
export const marginFor = (partsBytes: number, savesToFile: boolean): number => (savesToFile ? 0 : Math.round(partsBytes * OUTPUT_MARGIN))

export function spaceVerdict(i: SpaceInput): SpaceVerdict {
    const neededBytes = i.committedBytes + i.needBytes + i.marginBytes
    if (i.availableBytes === null || neededBytes <= i.availableBytes) return { fits: true, neededBytes, availableBytes: i.availableBytes, message: null }
    const short = neededBytes - i.availableBytes
    // The alternative is only worth naming when it would fit.
    const alt = i.alternative && i.committedBytes + i.alternative.needBytes + (i.marginBytes > 0 ? marginFor(i.alternative.needBytes, false) : 0) <= i.availableBytes ? i.alternative : null
    const message = `Not enough space to prepare the ${i.what} at ${i.qualityLabel}. Needs ${formatBytes(neededBytes)}, ${formatBytes(i.availableBytes)} available`
        + ` — free about ${formatBytes(short)} on this device to enable it.`
        + (i.marginBytes > 0 ? ' (That includes room for the export to build its file; Save to file needs less.)' : '')
        + (alt ? ` (Or choose ${alt.label}, which needs ${formatBytes(i.committedBytes + alt.needBytes + (i.marginBytes > 0 ? marginFor(alt.needBytes, false) : 0))}.)` : '')
    return { fits: false, neededBytes, availableBytes: i.availableBytes, message }
}
