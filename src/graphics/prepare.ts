import type { RenderGraphics } from '../render/types'
import type { GraphicsSpec } from './types'
import { ensureGraphicsFonts, loadLogo } from './assets'
import { loadCustomLogo } from './logoStore'
import { buildGraphicsSpec } from './plan'
import { toRenderGraphics } from './painters'

/** Builds the reel's graphics (loading the font and logo), or undefined when there are none to draw. */
export async function prepareGraphics(args: Parameters<typeof buildGraphicsSpec>[0]): Promise<RenderGraphics | undefined> {
    return prepareSpec(buildGraphicsSpec(args))
}

/** Turns a planned spec into painters (loading the font and logo), or undefined when there is nothing to draw. */
export async function prepareSpec(spec: GraphicsSpec | undefined): Promise<RenderGraphics | undefined> {
    if (!spec || (!spec.intro && !spec.outro && spec.overlays.length === 0)) return undefined
    await ensureGraphicsFonts()
    const logo = await loadLogo(await loadCustomLogo())
    return toRenderGraphics(spec, { logo })
}
