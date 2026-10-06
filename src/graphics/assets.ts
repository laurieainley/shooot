// Fonts and logo for match graphics (browser only).
export const DEFAULT_LOGO_URLS = ['/brand/tnf-logo.webp', '/brand/tnf-logo.png']

const FACES: [string, string][] = [
    ['/fonts/bebas-neue-latin.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
    ['/fonts/bebas-neue-latin-ext.woff2', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'],
]

let fontLoad: Promise<boolean> | null = null

/** Loads Bebas Neue (bundled); resolves false if it could not be loaded (a condensed fallback is used). */
export function loadGraphicsFont(): Promise<boolean> {
    fontLoad ??= (async () => {
        try {
            const faces = FACES.map(([url, unicodeRange]) => new FontFace('Bebas Neue', `url(${url}) format('woff2')`, { unicodeRange }))
            for (const f of faces) document.fonts.add(f)
            await Promise.all(faces.map((f) => f.load()))
            return true
        } catch (e) {
            console.warn('Graphics font could not be loaded', e)
            fontLoad = null
            return false
        }
    })()
    return fontLoad
}

/** Resolves true if `work` succeeds within `ms`, false if it fails or is too slow (never rejects, never hangs). */
export function settleWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), ms)
        work.then(() => { clearTimeout(timer); resolve(true) }, () => { clearTimeout(timer); resolve(false) })
    })
}

/** Every character the graphics draw, so the font faces covering them are fetched up front. */
const GRAPHICS_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 –-.\'()GOAL REPLAY'

/**
 * Makes sure Bebas Neue is usable before anything is painted (text drawn earlier would silently use a fallback
 * font with different metrics, which is what mis-centred captions on some phones). Fail-safe: resolves false after
 * `timeoutMs` and the painters then centre the fallback font from its measured metrics.
 */
export async function ensureGraphicsFonts(timeoutMs = 8000): Promise<boolean> {
    const ok = await settleWithin((async () => {
        if (!(await loadGraphicsFont())) throw new Error('graphics font unavailable')
        await document.fonts.load('48px "Bebas Neue"', GRAPHICS_GLYPHS)
    })(), timeoutMs)
    if (!ok) fontLoad = null
    return ok
}

/** The league logo as a bitmap: a custom image if given, otherwise the bundled T.N.F badge. */
export async function loadLogo(custom?: Blob | null): Promise<ImageBitmap | null> {
    if (custom) {
        try { return await createImageBitmap(custom) } catch { /* fall through to the default */ }
    }
    for (const url of DEFAULT_LOGO_URLS) {
        try {
            const res = await fetch(url)
            if (res.ok) return await createImageBitmap(await res.blob())
        } catch { /* try the next format */ }
    }
    return null
}
