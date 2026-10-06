import type { GoalAreas, MatchEvent, Team } from '../types'
import type { GraphicsSettings } from '../graphics/plan'
import type { FullMatchSettings } from './exportPlans'

/** Everything about a project except the video: events, teams, settings. */
export interface TransferPayload {
    events: MatchEvent[]
    teams: Team[]
    lengthBeforeGoalSec: number
    lengthAfterGoalSec: number
    replayBeforeSec: number
    replayAfterSec: number
    replaySpeed: number
    graphics: GraphicsSettings
    fullMatch: FullMatchSettings
    matchdayLabel: string | null
    goalAreas: GoalAreas | null
    whitesAttackLeft: boolean
    adjustTimestampsByOffset: boolean
}

const KEYS: (keyof TransferPayload)[] = [
    'events', 'teams', 'lengthBeforeGoalSec', 'lengthAfterGoalSec', 'replayBeforeSec', 'replayAfterSec', 'replaySpeed',
    'graphics', 'fullMatch', 'matchdayLabel', 'goalAreas', 'whitesAttackLeft', 'adjustTimestampsByOffset',
]

/** The transferable slice of the app state (never files). */
export function buildTransferPayload(state: TransferPayload): TransferPayload {
    const out: Record<string, unknown> = {}
    for (const k of KEYS) out[k] = state[k]
    return out as unknown as TransferPayload
}

const COMPRESSED = 'z1.'
const RAW = 'r1.'
/** Beyond this many characters a QR code gets too dense to scan reliably. */
export const QR_MAX_CHARS = 2500

function toBase64Url(bytes: Uint8Array): string {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('This link is damaged.')
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const writer = stream.writable.getWriter()
    void writer.write(bytes as BufferSource).catch(() => undefined)
    void writer.close().catch(() => undefined)
    return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

/** Project → `z1.<base64url(deflate-raw(json))>` (or `r1.<base64url(json)>` where CompressionStream is missing). */
export async function encodeProject(payload: TransferPayload): Promise<string> {
    const json = new TextEncoder().encode(JSON.stringify(payload))
    if (typeof CompressionStream === 'undefined') return RAW + toBase64Url(json)
    return COMPRESSED + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

function isPayload(v: unknown): v is TransferPayload {
    return !!v && typeof v === 'object' && Array.isArray((v as TransferPayload).events) && Array.isArray((v as TransferPayload).teams)
}

/** Inverse of `encodeProject`; throws on anything that is not a project link. */
export async function decodeProject(data: string): Promise<TransferPayload> {
    const prefix = data.slice(0, 3)
    if (prefix !== COMPRESSED && prefix !== RAW) throw new Error('This link was made by a different version of the app.')
    try {
        const bytes = fromBase64Url(data.slice(3))
        let raw = bytes
        if (prefix === COMPRESSED) {
            if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed links.')
            raw = await pipe(bytes, new DecompressionStream('deflate-raw'))
        }
        const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
        if (!isPayload(parsed)) throw new Error('not a project')
        return parsed
    } catch (e) {
        throw new Error(e instanceof Error && /browser cannot/.test(e.message) ? e.message : 'This link is damaged.')
    }
}

export function transferUrl(origin: string, encoded: string): string {
    return `${origin}/#p=${encoded}`
}

/** The project data in a location hash (`#p=...`), or null. */
export function fragmentData(hash: string): string | null {
    const m = /^#p=(.+)$/.exec(hash)
    return m ? m[1] : null
}

export function qrIsDense(link: string): boolean {
    return link.length > QR_MAX_CHARS
}
