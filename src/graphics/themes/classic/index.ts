// "Classic": the original look: navy ground, orange headings, Bebas Neue, team-colour shields.
import { eventLabel } from '../../../utils/eventTypes'
import { CARD_SEC } from '../../layout'
import { measureWith, paintOps } from './paint'
import { BUG_ROWS, CAPTION_ROWS, NAVY, ORANGE, REPLAY_ROWS, captionLayout, cardLayout, replayTagLayout, scoreBugLayout } from './layout'
import type { GraphicsTheme } from '../types'

const BEBAS_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const BEBAS_EXT_RANGE = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'

export const classicTheme: GraphicsTheme = {
    id: 'classic',
    name: 'Classic',
    swatch: { ground: NAVY, accent: ORANGE, text: '#ffffff' },
    fonts: [
        { family: 'Bebas Neue', url: '/fonts/bebas-neue-latin.woff2', unicodeRange: BEBAS_RANGE },
        { family: 'Bebas Neue', url: '/fonts/bebas-neue-latin-ext.woff2', unicodeRange: BEBAS_EXT_RANGE },
    ],
    fontChecks: ['48px "Bebas Neue"'],
    glyphs: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 –-.'()GOAL REPLAY",
    caption: { word: (e) => eventLabel(e).toUpperCase(), defaultStripe: ORANGE, minutes: false, scorers: false },
    rows: { bug: BUG_ROWS, caption: CAPTION_ROWS, replay: REPLAY_ROWS },
    paintCard: (ctx, spec, t, _d, assets) => paintOps(ctx, cardLayout(spec, t, CARD_SEC, !!assets.logo), assets),
    paintCaption: (ctx, spec, t, d, assets) => paintOps(ctx, captionLayout(spec, t, !!assets.logo, d, measureWith(ctx)), assets),
    paintScoreBug: (ctx, bug, t, d, fade, assets) => paintOps(ctx, scoreBugLayout(bug, t, d, !!assets.logo, fade, measureWith(ctx)), assets),
    paintReplayTag: (ctx, t, d, _speed, assets) => paintOps(ctx, replayTagLayout(t, d, measureWith(ctx)), assets),
}
