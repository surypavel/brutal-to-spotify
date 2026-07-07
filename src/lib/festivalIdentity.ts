import { base64ToBuffer, bufferToBase64 } from './base64'

const STORAGE_KEY = 'festival_identity_v1'

const RSA_ALGO = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const

const SIGN_ALGO = { name: 'RSASSA-PKCS1-v1_5' } as const

interface StoredIdentity {
  identity: string
  publicKeyB64: string
  privateKeyPkcs8B64: string
  registered: boolean
  name: string
  email: string
}

function randomIdentity(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bufferToBase64(bytes.buffer)
}

async function generateStoredIdentity(): Promise<StoredIdentity> {
  const keyPair = await crypto.subtle.generateKey(RSA_ALGO, true, ['sign', 'verify'])
  const [publicKeyBuffer, privateKeyBuffer] = await Promise.all([
    crypto.subtle.exportKey('spki', keyPair.publicKey),
    crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
  ])
  return {
    identity: randomIdentity(),
    publicKeyB64: bufferToBase64(publicKeyBuffer),
    privateKeyPkcs8B64: bufferToBase64(privateKeyBuffer),
    registered: false,
    name: '',
    email: '',
  }
}

function readStored(): StoredIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as StoredIdentity) : null
}

function writeStored(stored: StoredIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

// Concurrent callers (e.g. React StrictMode's double effect invocation) must not race on
// localStorage and each generate their own keypair — dedupe behind a single in-flight promise.
let identityPromise: Promise<StoredIdentity> | null = null

export async function getOrCreateIdentity(): Promise<{ identity: string; publicKey: string }> {
  if (!identityPromise) {
    identityPromise = (async () => {
      const existing = readStored()
      if (existing) return existing
      const created = await generateStoredIdentity()
      writeStored(created)
      return created
    })()
  }
  const stored = await identityPromise
  return { identity: stored.identity, publicKey: stored.publicKeyB64 }
}

export function markRegistered(): void {
  const stored = readStored()
  if (!stored) throw new Error('No local festival identity to mark as registered')
  writeStored({ ...stored, registered: true })
}

export function isRegistered(): boolean {
  return readStored()?.registered ?? false
}

/** Wipes the local identity entirely — the next getOrCreateIdentity() call generates a fresh one. */
export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY)
  identityPromise = null
}

export function getProfile(): { name: string; email: string } {
  const stored = readStored()
  return { name: stored?.name ?? '', email: stored?.email ?? '' }
}

export function hasProfile(): boolean {
  const { name, email } = getProfile()
  return name.trim().length > 0 && email.trim().length > 0
}

/** Persists the profile and forces re-registration (sendUser) so the server picks up the new name/email. */
export function setProfile(name: string, email: string): void {
  const stored = readStored()
  if (!stored) throw new Error('No local festival identity yet')
  writeStored({ ...stored, name, email, registered: false })
}

export async function signChallenge(challengeValue: string): Promise<string> {
  const stored = readStored()
  if (!stored) throw new Error('No local festival identity to sign with')

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBuffer(stored.privateKeyPkcs8B64),
    RSA_ALGO,
    false,
    ['sign'],
  )
  const data = new TextEncoder().encode(challengeValue)
  const signatureBuffer = await crypto.subtle.sign(SIGN_ALGO, privateKey, data)
  return bufferToBase64(signatureBuffer)
}
