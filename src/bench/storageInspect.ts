// What this site keeps in the browser's private storage (OPFS), for the /bench Storage section and the report.
import { discardJob } from '../render/renderJob'
import { clearOldOutputs } from '../render/storage'
import { clearKept, cleanOutputs } from './expCommon'

export type OpfsEntry = { name: string; bytes: number; files: number }
type Dir = FileSystemDirectoryHandle & { entries?: () => AsyncIterable<[string, FileSystemHandle]> }

async function sizeOf(dir: Dir): Promise<{ bytes: number; files: number }> {
    let bytes = 0
    let files = 0
    if (!dir.entries) return { bytes, files }
    for await (const [, h] of dir.entries()) {
        try {
            if (h.kind === 'file') { bytes += (await (h as FileSystemFileHandle).getFile()).size; files++ } else { const s = await sizeOf(h as Dir); bytes += s.bytes; files += s.files }
        } catch { /* gone meanwhile */ }
    }
    return { bytes, files }
}

/** Every top-level entry of the site's OPFS with its total size and file count (folders summed), biggest first. Empty when there is no OPFS. */
export async function listOpfs(): Promise<OpfsEntry[]> {
    const out: OpfsEntry[] = []
    try {
        const root = await navigator.storage.getDirectory() as Dir
        if (!root.entries) return out
        for await (const [name, h] of root.entries()) {
            try {
                if (h.kind === 'file') out.push({ name, bytes: (await (h as FileSystemFileHandle).getFile()).size, files: 1 })
                else out.push({ name: `${name}/`, ...(await sizeOf(h as Dir)) })
            } catch { /* gone meanwhile */ }
        }
    } catch { /* no OPFS */ }
    return out.sort((a, b) => b.bytes - a.bytes)
}

/** Bench outputs, kept copies, the bench's saved progress and its unit cache. Never throws. */
export async function clearBenchFiles(): Promise<void> {
    await discardJob('fullMatch').catch(() => undefined)
    await clearOldOutputs().catch(() => undefined)
    await clearKept().catch(() => undefined)
    await cleanOutputs().catch(() => undefined)
}

/** Everything in this site's OPFS (also saved export progress and saved parts). Never throws. */
export async function clearAllOpfs(): Promise<void> {
    await discardJob().catch(() => undefined) // the saved-job records in IndexedDB go with their folders
    try {
        const root = await navigator.storage.getDirectory() as Dir
        const names: string[] = []
        if (root.entries) for await (const [name] of root.entries()) names.push(name)
        for (const n of names) await root.removeEntry(n, { recursive: true }).catch(() => undefined)
    } catch { /* no OPFS */ }
}

export const mb = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`)
