// Where a team's line-up goes on the VS card: one column up to 6 names, two columns up to 12, then "+N MORE".
// Pure geometry shared by the themes (each draws its own icon and text from these positions).

export const ROSTER_ROWS = 6
export const ROSTER_MAX = ROSTER_ROWS * 2

export type RosterItem = {
    name: string
    /** Left edge of the icon (a shirt) and of the name, and the name's width limit. */
    iconX: number
    nameX: number
    maxWidth: number
    /** Vertical centre of the row. */
    y: number
}
export type RosterLayout = { items: RosterItem[]; more?: { text: string; x: number; y: number; maxWidth: number }; width: number }

export type RosterOptions = {
    /** Centre of the block (the team's centre line), and the row y of the first row's centre. */
    cx: number
    top: number
    step: number
    iconW: number
    gap: number
    colGap: number
    /** The block never reaches further than this from `cx` on either side. */
    maxHalf: number
    /** Width of a name at the roster text size. */
    measure: (text: string) => number
}

/** Names split over columns: balanced up to 12, then 11 names and a "+N MORE" slot. */
export function rosterColumns(names: string[]): { columns: string[][]; moreCount: number } {
    if (names.length <= ROSTER_ROWS) return { columns: names.length ? [names] : [], moreCount: 0 }
    if (names.length <= ROSTER_MAX) {
        const half = Math.ceil(names.length / 2)
        return { columns: [names.slice(0, half), names.slice(half)], moreCount: 0 }
    }
    const shown = names.slice(0, ROSTER_MAX - 1)
    return { columns: [shown.slice(0, ROSTER_ROWS), shown.slice(ROSTER_ROWS)], moreCount: names.length - shown.length }
}

/** Left-aligned columns, the block centred on `cx`. */
export function rosterLayout(names: string[], o: RosterOptions): RosterLayout {
    const { columns, moreCount } = rosterColumns(names)
    if (!columns.length) return { items: [], width: 0 }
    const n = columns.length
    const nameCap = (2 * o.maxHalf - (n - 1) * o.colGap) / n - o.iconW - o.gap
    const widest = Math.max(0, ...columns.flat().map((s) => o.measure(s)), moreCount ? o.measure(`+${moreCount} MORE`) : 0)
    const nameW = Math.min(widest, nameCap)
    const colW = o.iconW + o.gap + nameW
    const width = n * colW + (n - 1) * o.colGap
    const x0 = o.cx - width / 2
    const items: RosterItem[] = []
    columns.forEach((col, c) => {
        const cx0 = x0 + c * (colW + o.colGap)
        col.forEach((name, i) => items.push({ name, iconX: cx0, nameX: cx0 + o.iconW + o.gap, maxWidth: nameW, y: o.top + i * o.step }))
    })
    if (!moreCount) return { items, width }
    const last = columns[n - 1]
    const x = x0 + (n - 1) * (colW + o.colGap) + o.iconW + o.gap
    return { items, width, more: { text: `+${moreCount} MORE`, x, y: o.top + last.length * o.step, maxWidth: nameW } }
}
