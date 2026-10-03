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

export type PairedEntry<T> = {
    key: string | null
    proxy?: T
    full?: T
}

export function pairFiles<T extends { name: string }>(items: T[]): PairedEntry<T>[] {
    const byKey = new Map<string, PairedEntry<T>>()
    const others: PairedEntry<T>[] = []
    for (const item of items) {
        const parsed = parseGoProName(item.name)
        if (!parsed) {
            others.push({ key: null, proxy: undefined, full: item })
            continue
        }
        const entry = byKey.get(parsed.key) ?? { key: parsed.key, proxy: undefined, full: undefined }
        entry[parsed.kind] = item
        byKey.set(parsed.key, entry)
    }
    // key = CCNNNN; sort by recording (NNNN) then chapter (CC)
    const sortKey = (k: string): string => `${k.slice(2)}${k.slice(0, 2)}`
    const gopro = [...byKey.values()].sort((a, b) => sortKey(a.key!).localeCompare(sortKey(b.key!)))
    return [...gopro, ...others]
}
