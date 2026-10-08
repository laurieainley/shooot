import type { MatchEvent } from '../../types'
import type { Ctx, PaintAssets } from '../paint'
import type { BugSpec, CaptionSpec, CardSpec, CaptionTone } from '../types'

export type ThemeId = 'shooot' | 'classic'

/** A font file the theme draws with; faces are added to `document.fonts` only when the theme is used. */
export type ThemeFont = { family: string; url: string; unicodeRange?: string }

export type ScoreBugFade = boolean | { in: boolean; out: boolean }

/**
 * A look for the rendered graphics: the fonts it needs, how a caption is worded, its row bands (for the engine's
 * partial re-encode) and its painters. Each theme owns its draw-op language and sizes; the planning (what is shown,
 * when) is shared (plan.ts).
 */
export type GraphicsTheme = {
    id: ThemeId
    name: string
    /** Mini preview in the picker: ground, accent and text colours. */
    swatch: { ground: string; accent: string; text: string }
    fonts: ThemeFont[]
    /** `document.fonts.load` specs that must resolve before painting. */
    fontChecks: string[]
    /** The characters the graphics draw (fetched up front). */
    glyphs: string
    /** Caption content that depends on the look. */
    caption: {
        word: (e: Pick<MatchEvent, 'type' | 'pen'>) => string
        tone?: (e: Pick<MatchEvent, 'type'>) => CaptionTone
        /** Stripe colour of an event without a team. */
        defaultStripe: string
        /** Show the match minute and the full-time scorer columns. */
        minutes: boolean
        scorers: boolean
    }
    /** Design-space rows (top, bottom) each overlay can touch. */
    rows: { bug: [number, number]; caption: [number, number]; replay: [number, number] }
    paintCard: (ctx: Ctx, spec: CardSpec, t: number, duration: number, assets: PaintAssets) => void
    paintCaption: (ctx: Ctx, spec: CaptionSpec, t: number, duration: number, assets: PaintAssets) => void
    paintScoreBug: (ctx: Ctx, bug: BugSpec, t: number, duration: number, fade: ScoreBugFade, assets: PaintAssets) => void
    paintReplayTag: (ctx: Ctx, t: number, duration: number, speed: number, assets: PaintAssets) => void
}
