// Fonts and logo for match graphics (browser only).
import { DEFAULT_THEME_ID, getTheme, type GraphicsTheme, type ThemeId } from './themes'

export const DEFAULT_LOGO_URLS = ['/brand/tnf-logo.webp', '/brand/tnf-logo.png']

const fontLoads = new Map<ThemeId, Promise<boolean>>()

/** Loads the theme's bundled fonts (only that theme's); resolves false if any could not be loaded (fallbacks are used). */
export function loadGraphicsFont(theme: GraphicsTheme = getTheme(DEFAULT_THEME_ID)): Promise<boolean> {
    let load = fontLoads.get(theme.id)
    if (!load) {
        load = (async () => {
            try {
                const faces = theme.fonts.map((f) => new FontFace(f.family, `url(${f.url}) format('woff2')`, f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}))
                for (const f of faces) document.fonts.add(f)
                await Promise.all(faces.map((f) => f.load()))
                return true
            } catch (e) {
                console.warn('Graphics fonts could not be loaded', e)
                fontLoads.delete(theme.id)
                return false
            }
        })()
        fontLoads.set(theme.id, load)
    }
    return load
}

/** Resolves true if `work` succeeds within `ms`, false if it fails or is too slow (never rejects, never hangs). */
export function settleWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), ms)
        work.then(() => { clearTimeout(timer); resolve(true) }, () => { clearTimeout(timer); resolve(false) })
    })
}

/**
 * Makes sure the theme's fonts are usable before anything is painted (text drawn earlier would silently use a fallback
 * font with different metrics, which is what mis-centred captions on some phones). Fail-safe: resolves false after
 * `timeoutMs` and the painters then centre the fallback font from its measured metrics.
 */
export async function ensureGraphicsFonts(theme: GraphicsTheme = getTheme(DEFAULT_THEME_ID), timeoutMs = 8000): Promise<boolean> {
    const ok = await settleWithin((async () => {
        if (!(await loadGraphicsFont(theme))) throw new Error('graphics fonts unavailable')
        await Promise.all(theme.fontChecks.map((spec) => document.fonts.load(spec, theme.glyphs)))
    })(), timeoutMs)
    if (!ok) fontLoads.delete(theme.id)
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
