export type GoProKind = 'full' | 'proxy'

export type GoProName = {
    key: string
    chapter: number
    kind: GoProKind
}

const GOPRO_NAME = /^G([XHL])(\d{2})(\d{4})\.(MP4|LRV)$/i

export function parseGoProName(name: string): GoProName | null {
    const m = GOPRO_NAME.exec(name)
    if (!m) return null
    const letter = m[1].toUpperCase()
    const ext = m[4].toUpperCase()
    const isProxy = letter === 'L' && ext === 'LRV'
    const isFull = letter !== 'L' && ext === 'MP4'
    if (!isProxy && !isFull) return null
    return { key: `${m[2]}${m[3]}`, chapter: Number(m[2]), kind: isProxy ? 'proxy' : 'full' }
}
