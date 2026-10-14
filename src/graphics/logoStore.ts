import { del, get, set } from 'idb-keyval'

const KEY = 'graphics-logo'

/** What Match setup chose: a picked image, `'none'` (no league logo at all) or null (the bundled default). */
export type LogoChoice = Blob | 'none' | null

/** The logo choice from Match setup (IndexedDB, outside the persisted editor state). A storage failure means the default. */
export async function loadCustomLogo(): Promise<LogoChoice> {
    try {
        const v = await get<Blob | 'none'>(KEY)
        if (v === 'none') return 'none'
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

/** Draw the graphics with no league logo at all. */
export async function hideLogo(): Promise<void> {
    await set(KEY, 'none')
}
