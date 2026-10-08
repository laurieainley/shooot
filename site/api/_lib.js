import { createHash } from 'node:crypto'

export const ROLES = ['player', 'organiser']
export const MAX_PER_IP_PER_HOUR = 5

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function normaliseEmail(email) {
  return String(email).trim().toLowerCase()
}

export function isHoneypot(body) {
  return !!body && typeof body === 'object' && typeof body.company === 'string' && body.company.trim() !== ''
}

export function validateSignup(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 1 || name.length > 80) return { ok: false, error: 'Invalid name' }
  const email = typeof body.email === 'string' ? normaliseEmail(body.email) : ''
  if (email.length > 160 || !EMAIL_RE.test(email)) return { ok: false, error: 'Invalid email' }
  if (!ROLES.includes(body.role)) return { ok: false, error: 'Invalid role' }
  return { ok: true, value: { name, email, role: body.role } }
}

export function hashIp(ip, salt) {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

export function clientIp(headers, socketAddress) {
  const fwd = headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
  const real = headers['x-real-ip']
  if (typeof real === 'string' && real.trim()) return real.trim()
  return socketAddress || 'unknown'
}

export function notificationEmail({ name, email, role }) {
  const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ')
  return {
    subject: `New waitlist sign-up: ${oneLine(name)} (${role})`,
    text: `New waitlist sign-up\n\nName: ${name}\nEmail: ${email}\nRole: ${role}\n`,
  }
}
