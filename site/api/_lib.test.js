import { describe, it, expect } from 'vitest'
import { validateSignup, normaliseEmail, isHoneypot, hashIp, clientIp, notificationEmail, MAX_PER_IP_PER_HOUR } from './_lib.js'

describe('normaliseEmail', () => {
  it('should trim and lowercase', () => {
    expect(normaliseEmail('  Kev@Example.COM ')).toBe('kev@example.com')
  })
})

describe('isHoneypot', () => {
  it('should be true only for a non-empty company field', () => {
    expect(isHoneypot({ company: 'Acme' })).toBe(true)
    expect(isHoneypot({ company: '  ' })).toBe(false)
    expect(isHoneypot({})).toBe(false)
    expect(isHoneypot(null)).toBe(false)
  })
})

describe('validateSignup', () => {
  const good = { name: ' Kev ', email: 'Kev@Example.com', role: 'player' }
  it('should accept and normalise a valid body', () => {
    expect(validateSignup(good)).toEqual({ ok: true, value: { name: 'Kev', email: 'kev@example.com', role: 'player' } })
  })
  it('should accept organiser', () => {
    expect(validateSignup({ ...good, role: 'organiser' }).ok).toBe(true)
  })
  it('should reject bad names', () => {
    expect(validateSignup({ ...good, name: '   ' }).ok).toBe(false)
    expect(validateSignup({ ...good, name: 'x'.repeat(81) }).ok).toBe(false)
    expect(validateSignup({ ...good, name: 42 }).ok).toBe(false)
  })
  it('should reject implausible emails', () => {
    for (const email of ['', 'nope', 'a@b', 'a b@c.com', '@c.com', 'a@@c.com', 'a@c..com', `${'a'.repeat(160)}@x.com`]) {
      expect(validateSignup({ ...good, email }).ok, email).toBe(false)
    }
  })
  it('should reject unknown roles', () => {
    expect(validateSignup({ ...good, role: 'admin' }).ok).toBe(false)
    expect(validateSignup({ ...good, role: undefined }).ok).toBe(false)
  })
  it('should reject a non-object body', () => {
    expect(validateSignup(null).ok).toBe(false)
    expect(validateSignup('x').ok).toBe(false)
  })
})

describe('hashIp', () => {
  it('should be stable, salted and not contain the IP', () => {
    const a = hashIp('203.0.113.9', 's1')
    expect(a).toBe(hashIp('203.0.113.9', 's1'))
    expect(a).not.toBe(hashIp('203.0.113.9', 's2'))
    expect(a).not.toBe(hashIp('203.0.113.10', 's1'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('clientIp', () => {
  it('should prefer the first x-forwarded-for entry', () => {
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, '9.9.9.9')).toBe('1.2.3.4')
  })
  it('should fall back to x-real-ip then the socket address', () => {
    expect(clientIp({ 'x-real-ip': '4.4.4.4' }, '9.9.9.9')).toBe('4.4.4.4')
    expect(clientIp({}, '9.9.9.9')).toBe('9.9.9.9')
    expect(clientIp({}, undefined)).toBe('unknown')
  })
})

describe('notificationEmail', () => {
  it('should build subject and plain text body', () => {
    const m = notificationEmail({ name: 'Kev', email: 'kev@example.com', role: 'organiser' })
    expect(m.subject).toBe('New waitlist sign-up: Kev (organiser)')
    expect(m.text).toContain('kev@example.com')
    expect(m.text).toContain('organiser')
  })
  it('should strip newlines from the subject', () => {
    expect(notificationEmail({ name: 'A\nBcc: x', email: 'a@b.co', role: 'player' }).subject).not.toMatch(/\n/)
  })
})

it('should cap sign-ups per IP at 5', () => {
  expect(MAX_PER_IP_PER_HOUR).toBe(5)
})
