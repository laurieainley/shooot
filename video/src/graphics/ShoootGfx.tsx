// The product's own in-video graphics, painted with the app's code (src/graphics/themes/shooot): the same layout
// functions and canvas painter the render engine uses, so the scorebug, captions, REPLAY tag and cards match exactly.
import { useLayoutEffect, useRef } from 'react'
import { AbsoluteFill } from 'remotion'
import { captionLayout, cardLayout, replayTagLayout, scoreBugLayout, CAPTION_SEC, CARD_SEC } from '../../../src/graphics/themes/shooot/layout'
import { measureWith, paintOps } from '../../../src/graphics/themes/shooot/paint'
import type { BugSpec, CaptionSpec, CardSpec } from '../../../src/graphics/types'
import { KIT } from '../brand'

export { CAPTION_SEC, CARD_SEC }

export const TEAMS = {
    left: { name: 'WHITES', initials: 'W', colour: KIT.white, ink: '#0A0D12' },
    right: { name: 'COLOURS', initials: 'C', colour: KIT.yellow, ink: '#0A0D12' },
} as const

export function bug(l: number, r: number): BugSpec {
    return { left: 'W', right: 'C', leftColour: TEAMS.left.colour, rightColour: TEAMS.right.colour, text: `${l}–${r}` }
}

export type Gfx =
    | { kind: 'caption'; spec: CaptionSpec; t: number; duration?: number }
    | { kind: 'bug'; bug: BugSpec; t: number; duration: number; fade?: boolean | { in: boolean; out: boolean } }
    | { kind: 'replay'; t: number; speed?: number }
    | { kind: 'card'; spec: CardSpec; t: number; duration?: number }

type Props = { items: Gfx[]; scale?: number }

/** Paints graphics over a 1920×1080 frame (`scale` renders the canvas sharper for zoomed shots). */
export function ShoootGfx({ items, scale = 1 }: Props): React.ReactElement {
    const ref = useRef<HTMLCanvasElement>(null)
    useLayoutEffect(() => {
        const cv = ref.current
        if (!cv) return
        const ctx = cv.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, cv.width, cv.height)
        const m = measureWith(ctx)
        const assets = { logo: null }
        for (const it of items) {
            switch (it.kind) {
                case 'caption':
                    paintOps(ctx, captionLayout(it.spec, it.t, false, it.duration ?? CAPTION_SEC, m), assets)
                    break
                case 'bug':
                    paintOps(ctx, scoreBugLayout(it.bug, it.t, it.duration, false, it.fade ?? false, m), assets)
                    break
                case 'replay':
                    paintOps(ctx, replayTagLayout(it.t, 10, m, it.speed ?? 0.5), assets)
                    break
                case 'card':
                    paintOps(ctx, cardLayout(it.spec, it.t, it.duration ?? CARD_SEC, false, m), assets)
                    break
            }
        }
    })
    return (
        <AbsoluteFill>
            <canvas ref={ref} width={1920 * scale} height={1080 * scale} style={{ width: 1920, height: 1080 }} />
        </AbsoluteFill>
    )
}

export function goalCaption(person: string, minute: string, score: [number, number], opts: Partial<CaptionSpec> = {}): CaptionSpec {
    return { label: 'GOAL!', tone: 'goal', person, minute, stripe: TEAMS.left.colour, bug: bug(score[0], score[1]), ...opts }
}

export const VS_CARD: CardSpec = { heading: 'THURSDAY 5-A-SIDE', centre: 'VS', left: TEAMS.left, right: TEAMS.right }
export const FT_CARD: CardSpec = {
    heading: 'FULL TIME',
    centre: '8–12',
    left: TEAMS.left,
    right: TEAMS.right,
    scorers: {
        left: [
            { name: 'SAM L', minutes: "'4 '19 '33" },
            { name: 'A LO', minutes: "'12 '27" },
            { name: 'RYAN', minutes: "'8 '41" },
            { name: 'LAURIE', minutes: "'58" },
        ],
        // Placeholder until the real reel's full-time card arrives (assets/reel): only players named in the storyboard.
        right: [
            { name: 'JAK', minutes: "'25 OG" },
        ],
    },
}
