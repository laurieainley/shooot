// "Shooot": the brand pack look (brand/shooot/BRAND.md, "In-reel graphics").
import type { CaptionTone } from '../../types'
import type { MatchEvent } from '../../../types'
import { CARD_SEC } from '../../layout'
import { C } from './brandColors'
import { FONT_VOICES, VOICES, fontCss } from './fonts'
import { BUG_ROWS, CAPTION_ROWS, REPLAY_ROWS, captionLayout, cardLayout, replayTagLayout, scoreBugLayout } from './layout'
import { measureWith, paintOps } from './paint'
import type { GraphicsTheme } from '../types'

/** The event word of a caption, in the stadium voice. */
export function captionWord(e: Pick<MatchEvent, 'type' | 'pen'>): string {
    switch (e.type) {
        case 'goal': return e.pen ? 'PEN GOAL' : 'GOAL!'
        case 'own_goal': return 'OWN GOAL'
        case 'penalty_missed': return 'PENALTY MISSED'
        case 'penalty_conceded': return 'PENALTY CONCEDED'
        case 'save': return 'SAVE'
        case 'foul': return 'FOUL'
        case 'highlight': return 'HIGHLIGHT'
        default: return e.type.replace(/_/g, ' ').toUpperCase()
    }
}

const captionTone = (e: Pick<MatchEvent, 'type'>): CaptionTone => (e.type === 'goal' ? 'goal' : e.type === 'own_goal' ? 'ownGoal' : 'other')

export const shoootTheme: GraphicsTheme = {
    id: 'shooot',
    name: 'Shooot',
    swatch: { ground: C.ground, accent: C.lime, text: C.text },
    fonts: FONT_VOICES.map((v) => ({ family: VOICES[v].family, url: VOICES[v].url })),
    fontChecks: FONT_VOICES.map((v) => fontCss(v, 48)),
    glyphs: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 –-.'()!:×GOAL REPLAY",
    caption: { word: captionWord, tone: captionTone, defaultStripe: C.muted, minutes: true, scorers: true },
    rows: { bug: BUG_ROWS, caption: CAPTION_ROWS, replay: REPLAY_ROWS },
    paintCard: (ctx, spec, t, _d, assets) => paintOps(ctx, cardLayout(spec, t, CARD_SEC, !!assets.logo, measureWith(ctx)), assets),
    paintCaption: (ctx, spec, t, d, assets) => paintOps(ctx, captionLayout(spec, t, !!assets.logo, d, measureWith(ctx)), assets),
    paintScoreBug: (ctx, bug, t, d, fade, assets) => paintOps(ctx, scoreBugLayout(bug, t, d, !!assets.logo, fade, measureWith(ctx)), assets),
    paintReplayTag: (ctx, t, d, speed, assets) => paintOps(ctx, replayTagLayout(t, d, measureWith(ctx), speed), assets),
}
