// The "save to device" step of a real export: the page wraps the OPFS file, makes an object URL and starts a download, and
// the browser then reads the file through that URL. Measured after a stage, so the stage's own numbers stay comparable.
import type { DeliverTiming } from './results'

export async function measureDeliver(blob: Blob, name: string, realDownload: boolean): Promise<DeliverTiming> {
    const t0 = performance.now()
    const file = new File([blob], name, { type: 'video/mp4' })
    const url = URL.createObjectURL(file)
    const prepareMs = performance.now() - t0
    try {
        const t1 = performance.now()
        const res = await fetch(url)
        let bytes = 0
        if (res.body) {
            const reader = res.body.getReader()
            for (;;) {
                const r = await reader.read()
                if (r.done) break
                bytes += r.value.byteLength
            }
        } else bytes = (await res.arrayBuffer()).byteLength
        const readMs = performance.now() - t1
        const out: DeliverTiming = { prepareMs, readMs, readMBps: readMs > 0 ? bytes / 1048576 / (readMs / 1000) : 0, bytes }
        if (realDownload) {
            const t2 = performance.now()
            const a = document.createElement('a')
            a.href = url
            a.download = name
            a.style.display = 'none'
            document.body.appendChild(a)
            a.click()
            a.remove()
            out.clickMs = performance.now() - t2
            await new Promise((r) => setTimeout(r, 1500)) // let the browser start reading before the URL goes away
        }
        return out
    } finally {
        URL.revokeObjectURL(url)
    }
}
