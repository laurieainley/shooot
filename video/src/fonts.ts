// Self-hosted brand fonts (copied from the app's @fontsource packages and public/fonts). Loaded once per tab;
// rendering waits for them so no frame ever shows a fallback face.
import { continueRender, delayRender, staticFile } from 'remotion'

type Face = { family: string; file: string; desc?: FontFaceDescriptors }

const FACES: Face[] = [
    { family: 'Archivo Var', file: 'archivo-latin-wdth-normal.woff2', desc: { weight: '100 900', stretch: '62% 125%', style: 'normal' } },
    { family: 'Archivo Var', file: 'archivo-latin-wdth-italic.woff2', desc: { weight: '100 900', stretch: '62% 125%', style: 'italic' } },
    { family: 'Big Shoulders Var', file: 'big-shoulders-display-latin-wght-normal.woff2', desc: { weight: '100 900' } },
    { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-400-normal.woff2', desc: { weight: '400' } },
    { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-700-normal.woff2', desc: { weight: '700' } },
    // The static instances the app's canvas graphics use (src/graphics/themes/shooot/fonts.ts).
    { family: 'Shooot Stadium', file: 'archivo-stadium.woff2' },
    { family: 'Shooot Heading', file: 'archivo-heading.woff2' },
    { family: 'Shooot Scoreboard', file: 'archivo-scoreboard.woff2' },
    { family: 'Shooot Shirt', file: 'big-shoulders-800.woff2' },
    { family: 'Shooot Mono', file: 'jetbrains-mono-700.woff2' },
]

let loaded: Promise<void> | null = null

export function loadFonts(): Promise<void> {
    if (loaded) return loaded
    if (typeof document === 'undefined') return Promise.resolve()
    const handle = delayRender('brand fonts')
    loaded = Promise.all(
        FACES.map(async (f) => {
            const face = new FontFace(f.family, `url('${staticFile(`fonts/${f.file}`)}') format('woff2')`, f.desc)
            await face.load()
            document.fonts.add(face)
        }),
    ).then(
        () => continueRender(handle),
        (e) => {
            console.error('font load failed', e)
            continueRender(handle)
        },
    )
    return loaded
}

loadFonts()
