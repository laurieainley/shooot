// "TNF": the league's badge look: sky-blue rounded panels with a white rim, shirt yellow, orange/white stripes, Baloo 2.
import { CARD_SEC } from '../../layout'
import { captionWord } from '../shooot'
import type { GraphicsTheme } from '../types'
import { T } from './colors'
import { FONT_VOICES, VOICES, fontCss } from './fonts'
import { BUG_ROWS, CAPTION_ROWS, REPLAY_ROWS, captionLayout, cardLayout, replayTagLayout, scoreBugLayout } from './layout'
import { measureWith, paintOps } from './paint'

export const tnfTheme: GraphicsTheme = {
    id: 'tnf',
    name: 'TNF',
    swatch: { ground: T.sky, accent: T.yellow, text: T.white },
    fonts: FONT_VOICES.map((v) => ({ family: VOICES[v].family, url: VOICES[v].url })),
    fontChecks: FONT_VOICES.map((v) => fontCss(v, 48)),
    glyphs: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 –-.'()!:×GOAL REPLAY",
    caption: {
        word: captionWord,
        tone: (e) => (e.type === 'goal' ? 'goal' : e.type === 'own_goal' ? 'ownGoal' : 'other'),
        defaultStripe: T.sky,
        minutes: true,
        scorers: true,
    },
    rows: { bug: BUG_ROWS, caption: CAPTION_ROWS, replay: REPLAY_ROWS },
    paintCard: (ctx, spec, t, _d, assets) => paintOps(ctx, cardLayout(spec, t, CARD_SEC, !!assets.logo, measureWith(ctx)), assets),
    paintCaption: (ctx, spec, t, d, assets) => paintOps(ctx, captionLayout(spec, t, !!assets.logo, d, measureWith(ctx)), assets),
    paintScoreBug: (ctx, bug, t, d, fade, assets) => paintOps(ctx, scoreBugLayout(bug, t, d, !!assets.logo, fade, measureWith(ctx)), assets),
    paintReplayTag: (ctx, t, d, speed, assets) => paintOps(ctx, replayTagLayout(t, d, measureWith(ctx), speed), assets),
}
