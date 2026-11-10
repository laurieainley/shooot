import { describe, expect, it, vi } from 'vitest'
import { ReuseLedger, pickCachedUnit, type PickInput } from './cachedUnit'
import { encodeDescription, type CachedUnit, type UnitMeta } from './unitCache'
import { OPENH264_4K_AVCC, VT_4K_AVCC, hex } from './nal.fixtures'

const LOCAL = '1'.repeat(32)
const PORT = 'a'.repeat(32)
const VT = hex(VT_4K_AVCC)
const OH = hex(OPENH264_4K_AVCC) // same profile (High) and level (5.1) bytes as VT: only a full comparison tells them apart
async function* none(): AsyncGenerator<never> { /* no records */ }
const unit = (d: Uint8Array, extra: Partial<UnitMeta> = {}): CachedUnit => ({ records: none(), meta: { applied: [], video: { codec: 'avc1.640033', description: encodeDescription(d)! }, bytes: 0, ...extra } })
/** The engine's old direct-path rule: profile and level bytes only. */
const profileLevel = (a: Uint8Array, b: Uint8Array): boolean => a[1] === b[1] && a[3] === b[3]

const input = (o: Partial<PickInput> & { local?: CachedUnit | null; imported?: CachedUnit | null } = {}): PickInput => {
    const local = o.local === undefined ? null : o.local
    const imported = o.imported === undefined ? unit(OH, { imported: true, portable: PORT, device: 'iPhone' }) : o.imported
    return {
        u: 3,
        store: { load: vi.fn(async (k: string) => (k === LOCAL ? local : null)), findPortable: vi.fn(async (k: string) => (k === PORT ? imported : null)) },
        cached: new Set([...(local ? [LOCAL] : []), ...(imported ? [PORT] : [])]),
        key: LOCAL,
        portableKey: async () => PORT,
        direct: null,
        localVideo: async () => ({ codec: 'avc1.640033', description: VT }),
        admit: vi.fn(async () => true),
        note: vi.fn(),
        ...o,
    }
}

describe('pickCachedUnit (the engine restoring a unit from the cache)', () => {
    it('should restore a part prepared on another device when the local key misses, and count it for that device', async () => {
        const o = input()
        const pick = await pickCachedUnit(o)
        expect(pick).not.toBeNull()
        expect(pick!.portable).toBe(true)
        expect(pick!.key).toBe(PORT)
        expect(o.admit).toHaveBeenCalledWith(expect.objectContaining({ codec: 'avc1.640033' }), false) // from elsewhere: checked with the probe
        const ledger = new ReuseLedger()
        ledger.restored(3, pick!)
        expect(ledger.usedKeys.get(3)).toBe(PORT)
        expect(ledger.importedFrom.get('iPhone')).toBe(1)
    })
    it('should take the local key first', async () => {
        const o = input({ local: unit(VT) })
        const pick = await pickCachedUnit(o)
        expect(pick!.portable).toBe(false)
        expect(pick!.key).toBe(LOCAL)
        expect(o.store.findPortable).not.toHaveBeenCalled()
        expect(o.admit).toHaveBeenCalledWith(expect.anything(), true)
        const ledger = new ReuseLedger()
        ledger.restored(0, pick!)
        expect(ledger.importedFrom.size).toBe(0)
    })
    it('should encode a unit here when the journaled join check refuses the part', async () => {
        expect(await pickCachedUnit(input({ admit: async () => false }))).toBeNull()
    })
    it('on "Save to file…", should refuse a part from another device whose record is not byte for byte this encoder\'s (same profile and level)', async () => {
        const o = input({ direct: { entry: null, sameEntry: profileLevel } })
        expect(await pickCachedUnit(o)).toBeNull()
        expect(o.note).toHaveBeenCalledWith(expect.stringContaining('prepared on iPhone'))
        expect(o.admit).not.toHaveBeenCalled()
        // The same file already started with VT's record: the profile-and-level rule alone would have let it in.
        expect(await pickCachedUnit(input({ direct: { entry: VT, sameEntry: profileLevel } }))).toBeNull()
    })
    it('on "Save to file…", should take a part from another device whose record is identical to this encoder\'s', async () => {
        const pick = await pickCachedUnit(input({ imported: unit(VT, { imported: true, portable: PORT, device: 'iPad' }), direct: { entry: null, sameEntry: profileLevel } }))
        expect(pick?.portable).toBe(true)
    })
    it('on "Save to file…", should refuse a part from another device when this encoder cannot be probed', async () => {
        expect(await pickCachedUnit(input({ direct: { entry: null, sameEntry: profileLevel }, localVideo: async () => { throw new Error('no encoder') } }))).toBeNull()
    })
    it('should count a hit that cannot be read as a miss and forget it', async () => {
        const o = input()
        o.store.findPortable = async () => null
        expect(await pickCachedUnit(o)).toBeNull()
        expect(o.cached.has(PORT)).toBe(false)
    })
    it('should miss when neither key is in the store', async () => {
        expect(await pickCachedUnit(input({ imported: null }))).toBeNull()
        expect(await pickCachedUnit(input({ portableKey: async () => null }))).toBeNull()
    })
})
