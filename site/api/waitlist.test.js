import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = { calls: [], recent: 0, inserted: true, fail: false }
function sql(strings, ...values) {
  const text = strings.join('?')
  state.calls.push({ text, values })
  if (state.fail) return Promise.reject(new Error('db down'))
  if (/count\(\*\)/i.test(text)) return Promise.resolve([{ n: state.recent }])
  if (/insert into waitlist/i.test(text)) return Promise.resolve([{ inserted: state.inserted }])
  return Promise.resolve([])
}
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn(() => sql) }))

function mockRes() {
  const res = { statusCode: 0, body: undefined, headers: {} }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.setHeader = (k, v) => { res.headers[k] = v; return res }
  res.end = () => res
  return res
}
const req = (over = {}) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'UA', referer: 'https://x.test/' },
  socket: { remoteAddress: '127.0.0.1' },
  body: { name: 'Kev', email: 'Kev@Example.com', role: 'player', company: '' },
  ...over,
})

let handler
beforeEach(async () => {
  state.calls = []; state.recent = 0; state.inserted = true; state.fail = false
  process.env.DATABASE_URL = 'postgres://x'
  delete process.env.RESEND_API_KEY; delete process.env.WAITLIST_NOTIFY_TO; delete process.env.WAITLIST_NOTIFY_FROM
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })))
  vi.resetModules()
  handler = (await import('./waitlist.js')).default
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('waitlist handler', () => {
  it('should 405 for other methods', async () => {
    const res = mockRes(); await handler(req({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405); expect(res.headers.Allow).toBe('POST')
  })
  it('should 400 on invalid input without touching the db', async () => {
    const res = mockRes(); await handler(req({ body: { name: '', email: 'x', role: 'player' } }), res)
    expect(res.statusCode).toBe(400); expect(state.calls).toHaveLength(0)
  })
  it('should accept a JSON string body', async () => {
    const res = mockRes(); await handler(req({ body: JSON.stringify({ name: 'Kev', email: 'k@e.com', role: 'player' }) }), res)
    expect(res.statusCode).toBe(201)
  })
  it('should 200 and do nothing when the honeypot is filled', async () => {
    const res = mockRes(); await handler(req({ body: { name: 'Bot', email: 'b@e.com', role: 'player', company: 'Spam Ltd' } }), res)
    expect(res.statusCode).toBe(200); expect(state.calls).toHaveLength(0); expect(fetch).not.toHaveBeenCalled()
  })
  it('should 201 on a new sign-up, storing lowercased email and a hashed IP', async () => {
    const res = mockRes(); await handler(req(), res)
    expect(res.statusCode).toBe(201)
    const insert = state.calls.find((c) => /insert into waitlist/i.test(c.text))
    expect(insert.values).toContain('kev@example.com')
    expect(insert.values).not.toContain('203.0.113.9')
    expect(insert.values.some((v) => /^[0-9a-f]{64}$/.test(v))).toBe(true)
  })
  it('should create the table idempotently, once per instance', async () => {
    await handler(req(), mockRes()); await handler(req(), mockRes())
    expect(state.calls.filter((c) => /create table if not exists waitlist/i.test(c.text))).toHaveLength(1)
  })
  it('should 200 on a duplicate and not notify', async () => {
    state.inserted = false
    process.env.RESEND_API_KEY = 'k'; process.env.WAITLIST_NOTIFY_TO = 'me@x.com'
    const res = mockRes(); await handler(req(), res)
    expect(res.statusCode).toBe(200); expect(fetch).not.toHaveBeenCalled()
  })
  it('should 429 over the per-IP limit', async () => {
    state.recent = 5
    const res = mockRes(); await handler(req(), res)
    expect(res.statusCode).toBe(429)
    expect(state.calls.some((c) => /insert into waitlist/i.test(c.text))).toBe(false)
  })
  it('should 500 on db failure', async () => {
    state.fail = true; vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = mockRes(); await handler(req(), res)
    expect(res.statusCode).toBe(500)
  })
  it('should send a Resend notification for new sign-ups', async () => {
    process.env.RESEND_API_KEY = 'rk'; process.env.WAITLIST_NOTIFY_TO = 'me@x.com'
    const res = mockRes(); await handler(req(), res)
    expect(res.statusCode).toBe(201)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer rk')
    const body = JSON.parse(init.body)
    expect(body.to).toEqual(['me@x.com']); expect(body.from).toBe('Shooot <waitlist@shooot.co.uk>')
    expect(body.subject).toBe('New waitlist sign-up: Kev (player)')
  })
  it('should skip the email when Resend is not configured', async () => {
    await handler(req(), mockRes()); expect(fetch).not.toHaveBeenCalled()
  })
  it('should still 201 when the email fails', async () => {
    process.env.RESEND_API_KEY = 'rk'; process.env.WAITLIST_NOTIFY_TO = 'me@x.com'
    fetch.mockRejectedValueOnce(new Error('network')); vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = mockRes(); await handler(req(), res)
    expect(res.statusCode).toBe(201)
  })
})
