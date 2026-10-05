import type { RenderGraphics } from '../render/types'
import { loadGraphicsFont, loadLogo } from './assets'
import { loadCustomLogo } from './logoStore'
import { buildGraphicsSpec } from './plan'
import { toRenderGraphics } from './painters'

/** Builds the reel's graphics (loading the font and logo), or undefined when there are none to draw. */
export async function prepareGraphics(args: Parameters<typeof buildGraphicsSpec>[0]): Promise<RenderGraphics | undefined> {
    const spec = buildGraphicsSpec(args)
    if (!spec.intro && !spec.outro && spec.overlays.length === 0) return undefined
    await loadGraphicsFont()
    const logo = await loadLogo(await loadCustomLogo())
    return toRenderGraphics(spec, { logo })
}
