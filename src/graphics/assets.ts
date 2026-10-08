// Fonts and logo for match graphics (browser only).
import { FONT_VOICES, VOICES, fontCss } from './fonts'

export const DEFAULT_LOGO_URLS = ['/brand/tnf-logo.webp', '/brand/tnf-logo.png']

let fontLoad: Promise<boolean> | null = null

/** Loads the brand voices (bundled static instances); resolves false if any could not be loaded (fallbacks are used). */
export function loadGraphicsFont(): Promise<boolean> {
    fontLoad ??= (async () => {
        try {
            const faces = FONT_VOICES.map((v) => new FontFace(VOICES[v].family, `url(${VOICES[v].url}) format('woff2')`))
            for (const f of faces) document.fonts.add(f)
            await Promise.all(faces.map((f) => f.load()))
            return true
        } catch (e) {
            console.warn('Graphics fonts could not be loaded', e)
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
const GRAPHICS_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 –-.'()!:×GOAL REPLAY"

/**
 * Makes sure every brand voice is usable before anything is painted (text drawn earlier would silently use a fallback
 * font with different metrics, which is what mis-centred captions on some phones). Fail-safe: resolves false after
 * `timeoutMs` and the painters then centre the fallback font from its measured metrics.
 */
export async function ensureGraphicsFonts(timeoutMs = 8000): Promise<boolean> {
    const ok = await settleWithin((async () => {
        if (!(await loadGraphicsFont())) throw new Error('graphics fonts unavailable')
        await Promise.all(FONT_VOICES.map((v) => document.fonts.load(fontCss(v, 48), GRAPHICS_GLYPHS)))
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
