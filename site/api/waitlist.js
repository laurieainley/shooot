import { neon } from '@neondatabase/serverless'
import {
  MAX_PER_IP_PER_HOUR, clientIp, hashIp, isHoneypot, notificationEmail, validateSignup,
} from './_lib.js'

let schemaReady

function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS waitlist (
        id bigserial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        user_agent text,
        referrer text,
        ip_hash text
      )`
      await sql`CREATE INDEX IF NOT EXISTS waitlist_ip_hash_created_idx ON waitlist (ip_hash, created_at)`
    })().catch((err) => { schemaReady = undefined; throw err })
  }
  return schemaReady
}

async function notify(person) {
  const key = process.env.RESEND_API_KEY
  const to = process.env.WAITLIST_NOTIFY_TO
  if (!key || !to) return
  try {
    const { subject, text } = notificationEmail(person)
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.WAITLIST_NOTIFY_FROM || 'Shooot <waitlist@shooot.co.uk>',
        to: [to], subject, text,
      }),
    })
    if (!r.ok) console.error('waitlist notify failed', r.status, await r.text())
  } catch (err) {
    console.error('waitlist notify error', err)
  }
}

function parseBody(body) {
  if (typeof body !== 'string') return body
  try { return JSON.parse(body) } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const body = parseBody(req.body)
  if (isHoneypot(body)) return res.status(200).json({ ok: true })
  const parsed = validateSignup(body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { name, email, role } = parsed.value

  try {
    const sql = neon(process.env.DATABASE_URL)
    await ensureSchema(sql)
    const ipHash = hashIp(clientIp(req.headers, req.socket?.remoteAddress), process.env.IP_HASH_SALT || 'shooot')

    const [{ n }] = await sql`SELECT count(*)::int AS n FROM waitlist
      WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'`
    if (n >= MAX_PER_IP_PER_HOUR) return res.status(429).json({ error: 'Too many sign-ups, try later' })

    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300) || null
    const referrer = String(req.headers.referer || '').slice(0, 300) || null
    const [row] = await sql`INSERT INTO waitlist (name, email, role, user_agent, referrer, ip_hash)
      VALUES (${name}, ${email}, ${role}, ${userAgent}, ${referrer}, ${ipHash})
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role
      RETURNING (xmax = 0) AS inserted`
    if (!row.inserted) return res.status(200).json({ ok: true })

    await notify({ name, email, role })
    return res.status(201).json({ ok: true })
  } catch (err) {
    console.error('waitlist db error', err)
    return res.status(500).json({ error: 'Something went wrong' })
  }
}
