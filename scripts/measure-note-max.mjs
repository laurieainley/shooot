// Re-measures NOTE_MAX (src/utils/eventTypes.ts) with the real caption fonts. Usage: npx vite --port 5195 --strictPort & node scripts/measure-note-max.mjs (needs playwright + Chrome; run from a folder that can import 'playwright').
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome' })
const pg = await (await b.newContext({ ignoreHTTPSErrors: true })).newPage()
pg.on('console', (m) => console.log('[c]', m.text()))
pg.on('pageerror', (e) => console.log('[err]', e.message))
await pg.goto('https://localhost:5195/bench.html')
const out = await pg.evaluate(async () => {
  const { getTheme } = await import('/src/graphics/themes/index.ts')
  const { ensureGraphicsFonts } = await import('/src/graphics/assets.ts')
  const sh = await import('/src/graphics/themes/shooot/paint.ts')
  const tn = await import('/src/graphics/themes/tnf/paint.ts')
  const cl = await import('/src/graphics/themes/classic/paint.ts')
  const res = {}
  const ctx = new OffscreenCanvas(10, 10).getContext('2d')
  const defs = [
    ['shooot', sh.measureWith(ctx), 30, 'shirt', 1200],
    ['tnf', tn.measureWith(ctx), 30, 'shirt', 1200],
    ['classic', cl.measureWith(ctx), 28, undefined, 1340],
  ]
  for (const [id, m0, size, voice, avail] of defs) {
    await ensureGraphicsFonts(getTheme(id))
    const m = (s) => voice ? m0(s, size, voice) : m0(s, size)
    const wrapCount = (words) => { // greedy lines needed
      let lines = 1, cur = ''
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (m(t) <= avail || !cur) cur = t; else { lines++; cur = w } }
      return lines
    }
    const r = { avail, W1: m('W'), M1: m('M'), space: m(' '), avg: m('LAURIE WAITS PATIENTLY FOR HARRY TO DO HIS LACES (FORESHADOWING)') / 64 }
    // largest n of W's on two lines (hard break, one long word)
    let n = 0; while (m('W'.repeat(n + 1)) <= 2 * avail) n++
    r.WcharsTwoLines = n
    const pat = (n, w) => { let s = ''; while (s.length < n) s += w; return s.slice(0, n).trim() }
    for (const [name, w] of [['MMMM WWWW ', 'MMMM WWWW '], ['WWWWWWW ', 'WWWWWWW '], ['WWW ', 'WWW ']]) {
      let k = 0; while (wrapCount(pat(k + 1, w).split(' ')) <= 2 && k < 400) k++
      r['cap ' + name] = k
    }
    res[id] = r
  }
  return res
})
console.log(JSON.stringify(out, null, 1))
await b.close()
