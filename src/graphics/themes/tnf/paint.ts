// TNF paints the Shooot draw ops (same angular shapes) with its own fonts and ground colours.
import type { PaintAssets, Ctx } from '../../paint'
import type { DrawOp, MeasureText } from '../shooot/layout'
import { measureWith as shoootMeasureWith, paintOps as shoootPaintOps, type PaintLook } from '../shooot/paint'
import { T } from './colors'
import { TNF_VOICE, VOICES, fontCss } from './fonts'

export const TNF_LOOK: PaintLook = {
    font: (voice, size) => fontCss(TNF_VOICE[voice], size),
    letterSpacing: (voice) => VOICES[TNF_VOICE[voice]].letterSpacing,
    groundFrom: T.navy,
    groundTo: T.navyLight,
    pitch: 'rgba(51,160,217,0.2)',
}

export const measureWith = (ctx: Ctx): MeasureText => shoootMeasureWith(ctx, TNF_LOOK)
export const paintOps = (ctx: Ctx, ops: DrawOp[], assets: PaintAssets): void => shoootPaintOps(ctx, ops, assets, TNF_LOOK)
