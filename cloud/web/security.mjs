import crypto from 'node:crypto'
export const digest = value => crypto.createHash('sha256').update(value).digest('hex')
export const random = () => crypto.randomBytes(32).toString('base64url')
export function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=')).filter(x => x.length === 2))
}
export function sameOrigin(req, origin) {
  return req.headers.origin === origin && req.headers['x-openfit-request'] === '1'
}
export function ownerIdentity(identity, ownerSub) {
  return typeof identity?.sub === 'string' && identity.sub === ownerSub
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(value + 'T12:00:00Z')
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
