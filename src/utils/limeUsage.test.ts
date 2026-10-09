import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Lime means two things only: the single primary action in view and goals. This scans App.css for rules that use a lime token
 * (--sh-lime, --sh-lime-text, --sh-lime-edge) and fails when one appears outside the allow-list, so neon cannot creep back.
 */
const ALLOWED = [
    '.btn-primary',           // the one primary action in a sheet or panel (Render, Done, Clear and start...)
    '.top-btn--primary',      // Export in the top bar
    '.ev-icon--goal',         // goal and penalty-goal icons (strip, rows, picker, edit sheet)
    '.scorebug__score',       // the score on the video
]

function ruleBlocks(css: string): { selector: string; body: string }[] {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const out: { selector: string; body: string }[] = []
    const re = /([^{}]+)\{([^{}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(stripped))) out.push({ selector: m[1].trim(), body: m[2] })
    return out
}

describe('lime usage in App.css', () => {
    const css = readFileSync(resolve(__dirname, '../App.css'), 'utf8')
    const offenders = ruleBlocks(css)
        .filter((r) => /--sh-lime(-text|-edge)?\b/.test(r.body))
        .filter((r) => !r.selector.split(',').every((sel) => ALLOWED.some((a) => sel.trim().startsWith(a))))
        .map((r) => r.selector)

    it('should use lime only on the primary action, goal icons and the scorebug score', () => {
        expect(offenders).toEqual([])
    })

    it('should still have the allow-listed rules (the guard scans real CSS)', () => {
        const used = ruleBlocks(css).filter((r) => /--sh-lime/.test(r.body)).map((r) => r.selector)
        expect(used.length).toBeGreaterThanOrEqual(ALLOWED.length - 1)
    })

    it('should not use lime in Tailwind classes in components', () => {
        // text-lime / bg-lime / border-lime utilities would bypass the CSS guard
        const root = resolve(__dirname, '..')
        const hits = (readdirSync(root, { recursive: true }) as string[])
            .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
            .filter((f) => /\b(text|bg|border|ring|fill|stroke)-(lime|on-lime)\b/.test(readFileSync(resolve(root, f), 'utf8')))
        expect(hits).toEqual([])
    })
})
