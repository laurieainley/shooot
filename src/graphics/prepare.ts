import type { RenderGraphics } from '../render/types'
import { isSting, type GraphicsSpec } from './types'
import { ensureGraphicsFonts, loadLogo, loadWordmark } from './assets'
import { loadCustomLogo } from './logoStore'
import { buildGraphicsSpec } from './plan'
import { toRenderGraphics } from './painters'
import { getTheme } from './themes'
import type { OverlayBitmapCache } from './overlayCache'

/** Builds the reel's graphics (loading the font and logo), or undefined when there are none to draw. */
export async function prepareGraphics(args: Parameters<typeof buildGraphicsSpec>[0]): Promise<RenderGraphics | undefined> {
    return prepareSpec(buildGraphicsSpec(args))
}

/** Turns a planned spec into painters (loading the font and logo), or undefined when there is nothing to draw. */
/** `cache` (benchmarks only, experiment 5): overlays draw from cached bitmaps instead of painting every frame. */
export async function prepareSpec(spec: GraphicsSpec | undefined, cache?: OverlayBitmapCache): Promise<RenderGraphics | undefined> {
    if (!spec || (!spec.intro && !spec.outro && spec.overlays.length === 0)) return undefined
    await ensureGraphicsFonts(getTheme(spec.theme))
    const logo = await loadLogo(await loadCustomLogo())
    const wordmark = isSting(spec.outro) ? await loadWordmark() : null
    return toRenderGraphics(spec, { logo, wordmark }, cache)
}
