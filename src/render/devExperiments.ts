// Dev server only: lets a Playwright run switch engine experiments on in the real editor (the prepared-parts round trip makes one browser
// stand in for a phone by encoding in software: `window.__shoootExperiments = { encoderFor: () => 'software', segmentSec: 4 }`).
// `import.meta.env.DEV` is false in a production build, so this is never reachable there (the bundler drops the read).
import type { RenderExperiments } from './experiments'

export function devExperiments(): RenderExperiments | undefined {
    if (!import.meta.env.DEV) return undefined
    return (globalThis as { __shoootExperiments?: RenderExperiments }).__shoootExperiments
}
