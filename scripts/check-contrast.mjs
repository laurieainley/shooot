// Contrast spot-check of the brand token pairs the UI uses (WCAG 2.x), both themes. Run: node scripts/check-contrast.mjs
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../brand/shooot/tokens.css', import.meta.url), 'utf8')
const block = (re) => Object.fromEntries([...(css.match(re)?.[1] ?? '').matchAll(/--sh-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
const dark = block(/^:root\s*\{([\s\S]*?)^\}/m)
const light = { ...dark, ...block(/\[data-theme="light"\]\s*\{([\s\S]*?)\}/) }
const extra = { video: '#050706', 'on-video': '#F3F1EA' }

const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

// [foreground token, background token, what it is]
const PAIRS = [
    ['text', 'ground', 'body text on page'], ['text', 'surface', 'body text on panels'], ['text', 'surface-2', 'text on hover / selected rows'],
    ['muted', 'ground', 'secondary text on page'], ['muted', 'surface', 'secondary text on panels'], ['muted', 'surface-2', 'secondary text on rows / buttons'],
    ['lime-text', 'ground', 'lime text / pen-goal tag on page'], ['lime-text', 'surface', 'lime text / pen-goal tag on panels'],
    ['on-lime', 'lime', 'primary button, goal tag'], ['ground', 'text', 'own-goal tag (ground on chalk)'],
    ['lime-text', 'surface-2', 'lime icon / large text on selected rows (3:1)', 3],
    ['on-video', 'video', 'overlay text on the picture'], ['lime', 'video', 'lime overlay text on the picture'],
]
let fail = 0
for (const [name, theme] of [['dark', dark], ['light', light]]) {
    const t = { ...theme, ...extra }
    console.log(`\n${name}`)
    for (const [fg, bg, what, min = 4.5] of PAIRS) {
        const r = ratio(t[fg], t[bg])
        const ok = r >= min
        if (!ok) fail++
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  ${fg} on ${bg}  (${what})`)
    }
}
console.log(fail ? `\n${fail} pair(s) below 4.5:1` : '\nAll pairs >= 4.5:1')
process.exit(fail ? 1 : 0)
