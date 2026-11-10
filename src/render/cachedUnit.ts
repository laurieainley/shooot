// Which cached unit, if any, stands in for a unit of the render being made (the engine's restoreUnit decision, kept apart so it can be tested
// without an encoder): the unit's local key first, then a part prepared on another device under its portable key, each admitted by the rules of
// the path the render takes.
import { decodeDescription, type CachedUnit, type UnitStore } from './unitCache'
import { sameVideo, type UnitVideo } from './encoderJoin'

export type CachedPick = { key: string; portable: boolean; hit: CachedUnit; own: UnitVideo }

export type PickInput = {
    u: number
    store: Pick<UnitStore, 'load' | 'findPortable'>
    /** Keys the store holds (a hit that turns out unreadable is taken out). */
    cached: Set<string>
    key: string | null
    portableKey: () => Promise<string | null>
    /**
     * Direct ("Save to file…") path: the file has one sample entry, so `entry` (the record already in the file, null before the first unit) must
     * match profile and level (`sameEntry`), and a part from another device must be byte for byte this encoder's own record (`localVideo`).
     */
    direct: { entry: Uint8Array | null; sameEntry: (entry: Uint8Array, d: Uint8Array) => boolean } | null
    localVideo: () => Promise<UnitVideo>
    /** Journaled path: whether one sample entry can still cover the unit (encoderJoin; `local` = on a local key, made by this encoder config). */
    admit: (v: UnitVideo, local: boolean) => Promise<boolean>
    note: (text: string) => void
}

/** The cached unit to restore for unit `u`, or null (a miss, or a part that does not fit: the unit is encoded here). */
export async function pickCachedUnit(o: PickInput): Promise<CachedPick | null> {
    let key = o.key
    let portable = false
    if (!key || !o.cached.has(key)) {
        const pk = await o.portableKey()
        if (!pk || !o.cached.has(pk)) return null
        key = pk
        portable = true
    }
    const hit = portable ? await o.store.findPortable(key) : await o.store.load(key)
    if (!hit) { o.cached.delete(key); return null }
    if (!hit.meta.video) return null
    const own: UnitVideo = { codec: hit.meta.video.codec, description: decodeDescription(hit.meta.video.description) }
    if (o.direct) {
        if (o.direct.entry && !o.direct.sameEntry(o.direct.entry, own.description)) return null
        if (portable) {
            const mine = await o.localVideo().catch(() => null)
            if (!mine || !sameVideo(mine, own)) {
                o.note(`Unit ${o.u}: its part prepared on ${hit.meta.device || 'another device'} (${own.codec}) is not this encoder's own: encoded here (a file saved as it goes keeps one encoder)`)
                return null
            }
        }
    } else if (!(await o.admit(own, !portable))) return null
    return { key, portable, hit, own }
}

/** What the render reused: the key each restored unit came from (for the cache's "last export") and the parts per device that made them. */
export class ReuseLedger {
    readonly usedKeys = new Map<number, string>()
    readonly importedFrom = new Map<string, number>()
    restored(u: number, pick: CachedPick): void {
        this.usedKeys.set(u, pick.key)
        if (pick.portable) { const d = pick.hit.meta.device || 'another device'; this.importedFrom.set(d, (this.importedFrom.get(d) ?? 0) + 1) }
    }
}

/** The portable key a kept unit gets: none when its audio fell back to silence (fine here, but never a part for another device). */
export function portableToKeep(portable: string | null, audioReplaced: boolean): string | null {
    return audioReplaced ? null : portable
}
