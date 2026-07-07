import { generateCodeChallenge, generateCodeVerifier } from './pkce'

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
const REDIRECT_URI =
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ??
  new URL(import.meta.env.BASE_URL, window.location.origin).toString()
const SCOPES = ['playlist-modify-public', 'playlist-modify-private', 'playlist-read-private'].join(' ')

const VERIFIER_KEY = 'spotify_code_verifier'
const TOKEN_KEY = 'spotify_token'

interface StoredToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

function readToken(): StoredToken | null {
  const raw = sessionStorage.getItem(TOKEN_KEY)
  return raw ? (JSON.parse(raw) as StoredToken) : null
}

function writeToken(token: StoredToken): void {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token))
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

export async function login(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Missing VITE_SPOTIFY_CLIENT_ID')
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem(VERIFIER_KEY, verifier)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`)
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
}

// An authorization code can only be exchanged once. React StrictMode (and any other double-mount)
// can invoke this concurrently, so dedupe behind a single in-flight promise rather than letting a
// second caller redeem the same code and get rejected by Spotify.
let redirectCallbackPromise: Promise<boolean> | null = null

export async function handleRedirectCallback(): Promise<boolean> {
  if (!redirectCallbackPromise) {
    redirectCallbackPromise = performRedirectCallback().finally(() => {
      redirectCallbackPromise = null
    })
  }
  return redirectCallbackPromise
}

async function performRedirectCallback(): Promise<boolean> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (error) {
    url.searchParams.delete('error')
    url.searchParams.delete('state')
    window.history.replaceState({}, '', url.toString())
    throw new Error(`Spotify authorization failed: ${error}`)
  }
  if (!code) return false

  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) return false

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID ?? '',
    code_verifier: verifier,
  })

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error('Failed to exchange authorization code for a token')
  const data = await response.json()

  writeToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  })

  sessionStorage.removeItem(VERIFIER_KEY)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  window.history.replaceState({}, '', url.toString())
  return true
}

async function refreshAccessToken(refreshToken: string): Promise<StoredToken> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID ?? '',
  })
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error('Failed to refresh Spotify token')
  const data = await response.json()
  const token: StoredToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  writeToken(token)
  return token
}

export async function getValidAccessToken(): Promise<string | null> {
  const token = readToken()
  if (!token) return null
  if (Date.now() < token.expiresAt - 60_000) return token.accessToken
  if (!token.refreshToken) return null
  const refreshed = await refreshAccessToken(token.refreshToken)
  return refreshed.accessToken
}

export function isLoggedIn(): boolean {
  return readToken() !== null
}
