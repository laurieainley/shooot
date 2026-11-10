// Parts prepared on another device that this render can no longer join: when this device's encoder changes mid-render (a hardware encoder failed and
// software took over) after such parts were admitted, the next unit's record may not share a sample entry with them. The render stops with a clear
// message, and the next attempt of the same render leaves other devices' parts out and starts afresh (once), so it cannot fail the same way again.
import { assertUnitJoins, type UnitVideo } from './encoderJoin'

const leftOut = new Set<string>()
const restart = new Set<string>()

export const importedLeftOut = (signature: string): boolean => leftOut.has(signature)
/** True once after the failure: the saved progress holds other devices' parts, so the next attempt discards it. */
export function takeImportedRestart(signature: string): boolean { return restart.delete(signature) }

export const IMPORTED_JOIN_FAILED = 'This device’s encoder changed during the render, so it can’t join the parts prepared on another device. Render again: this time every part is encoded here.'

/** assertUnitJoins, but a render that used other devices' parts fails with IMPORTED_JOIN_FAILED and leaves them out of its next attempt. */
export function checkUnitJoins(units: (UnitVideo | null)[], u: number, record: UnitVideo, o: { signature: string | null; importedUsed: boolean }): void {
    try { assertUnitJoins(units, u, record) } catch (e) {
        if (!o.importedUsed || !o.signature) throw e
        leftOut.add(o.signature)
        restart.add(o.signature)
        throw new Error(IMPORTED_JOIN_FAILED)
    }
}
