import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import { config } from './config'
import { db } from './db'
import { viewAccessKey } from '../src/lib/rpc'

// Admin sign-in uses NEP-413 signed messages: the wallet proves it controls the admin account.
export const SIGN_IN_MESSAGE = 'Sign in to the school fee dashboard'
export const SIGN_IN_RECIPIENT = 'school-fee-tracker'

const NEP413_TAG = 2147484061 // 2^31 + 413
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function base58Decode(text: string): Buffer {
  let value = 0n
  for (const char of text) {
    const index = BASE58.indexOf(char)
    if (index < 0) throw new Error('Invalid public key')
    value = value * 58n + BigInt(index)
  }
  const hex = value.toString(16)
  const body = Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex')
  const zeros = text.length - text.replace(/^1+/, '').length
  return Buffer.concat([Buffer.alloc(zeros), value === 0n ? Buffer.alloc(0) : body])
}

function borshString(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8')
  const length = Buffer.alloc(4)
  length.writeUInt32LE(bytes.length)
  return Buffer.concat([length, bytes])
}

export function nep413Hash(message: string, nonce: Buffer, recipient: string, callbackUrl: string | null): Buffer {
  const tag = Buffer.alloc(4)
  tag.writeUInt32LE(NEP413_TAG)
  const callback = callbackUrl === null ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), borshString(callbackUrl)])
  const payload = Buffer.concat([tag, borshString(message), nonce, borshString(recipient), callback])
  return createHash('sha256').update(payload).digest()
}

export function createChallenge(): string {
  const nonce = randomBytes(32).toString('base64')
  const now = Date.now()
  db.query('DELETE FROM challenges WHERE expires_at < ?').run(now)
  db.query('INSERT INTO challenges (nonce, expires_at) VALUES (?, ?)').run(nonce, now + 5 * 60_000)
  return nonce
}

export interface LoginInput {
  accountId: string
  publicKey: string
  signature: string
  nonce: string
  callbackUrls?: string[]
}

export async function login(input: LoginInput): Promise<string> {
  const challenge = db.query('SELECT expires_at FROM challenges WHERE nonce = ?').get(input.nonce) as
    | { expires_at: number }
    | null
  db.query('DELETE FROM challenges WHERE nonce = ?').run(input.nonce)
  if (!challenge || challenge.expires_at < Date.now()) throw new Error('The sign-in request expired. Please try again.')
  if (input.accountId !== config.adminAccount) throw new Error('This account is not the school administrator.')
  if (!input.publicKey.startsWith('ed25519:')) throw new Error('Unsupported key type.')

  const rawKey = base58Decode(input.publicKey.slice('ed25519:'.length))
  if (rawKey.length !== 32) throw new Error('Invalid public key.')
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]), format: 'der', type: 'spki' })
  const signature = Buffer.from(input.signature, 'base64')
  const nonce = Buffer.from(input.nonce, 'base64')

  // Some wallets include the callback URL in the signed payload, so try the candidates the browser reports.
  const candidates: Array<string | null> = [null, ...(input.callbackUrls ?? []).slice(0, 3)]
  const valid = candidates.some((callbackUrl) =>
    verify(null, nep413Hash(SIGN_IN_MESSAGE, nonce, SIGN_IN_RECIPIENT, callbackUrl), key, signature),
  )
  if (!valid) throw new Error('The signature could not be verified.')

  const access = await viewAccessKey(config.rpcUrl, input.accountId, input.publicKey).catch(() => null)
  if (!access || access.permission !== 'FullAccess') {
    throw new Error('Sign in with the main key of the administrator account.')
  }

  const token = randomBytes(32).toString('hex')
  const expires = Date.now() + config.sessionHours * 3_600_000
  db.query('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  db.query('INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)').run(token, input.accountId, expires)
  return token
}

export function sessionFrom(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const row = db.query('SELECT account_id, expires_at FROM sessions WHERE token = ?').get(token) as
    | { account_id: string; expires_at: number }
    | null
  if (!row || row.expires_at < Date.now() || row.account_id !== config.adminAccount) return null
  return token
}

export function logout(token: string): void {
  db.query('DELETE FROM sessions WHERE token = ?').run(token)
}
