import { del, get, set } from 'idb-keyval'

const KEY = 'graphics-logo'

/** The logo picked in Match setup (IndexedDB), or null for the bundled default. */
export async function loadCustomLogo(): Promise<Blob | null> {
    try {
        const v = await get<Blob>(KEY)
        return v instanceof Blob ? v : null
    } catch {
        return null
    }
}

export async function saveCustomLogo(blob: Blob): Promise<void> {
    if (!blob.type.startsWith('image/')) throw new Error('Pick an image file for the logo')
    await set(KEY, blob)
}

export async function clearCustomLogo(): Promise<void> {
    await del(KEY)
}
