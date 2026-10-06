/** Stable JSON: object keys sorted, so equal plans give equal text. */
function stable(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
    if (v && typeof v === 'object') {
        return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
    }
    return JSON.stringify(v) ?? 'null'
}

/** Identity of a render (plan, sources, graphics): an interrupted render resumes only into the same signature. */
export function jobSignature(plan: unknown): string {
    const text = stable(plan)
    // Two FNV-1a 32-bit hashes with different seeds → 64 bits.
    let h1 = 0x811c9dc5
    let h2 = 0x01000193 ^ text.length
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
        h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}
