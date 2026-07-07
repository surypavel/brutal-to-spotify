import { getOrCreateIdentity, getProfile, hasProfile, isRegistered, markRegistered, setProfile, signChallenge } from './festivalIdentity'
import type { FestivalQrCode } from './festivalQrCode'

export { clearIdentity as resetFestivalIdentity } from './festivalIdentity'

const EVENT = 'ba2026'
const API_BASE = (import.meta.env.VITE_FESTIVAL_API_BASE as string | undefined) ?? '/festival-api'

// The backend doesn't verify email ownership or enforce uniqueness (just a non-empty, valid-looking
// address, matching the real app's client-side check) — a permanently-reserved placeholder is fine.
const DEFAULT_NAME = 'Spotify Integration'
const DEFAULT_EMAIL = 'spotify-integration@example.com'

interface FestivalUser {
  id: number
  identity: string
  public_key: string
  name: string
  email: string
  image_url: string
  is_public: boolean
}

interface FestivalChallenge {
  value: string
  signature: string
}

interface ArtistFavourite {
  id: number
  favourite_level: number
  artist_id: number
  user_id: number
  user?: FestivalUser
}

interface ArtistFavouriteDto {
  favourites: ArtistFavourite[]
  user?: FestivalUser
  challenge?: FestivalChallenge
}

export interface FestivalArtist {
  id: number
  name: string
  url: string
  image_url: string
  thumb_url: string
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  console.debug('[festivalApi] request', path, init?.method ?? 'GET', init?.body)
  const response = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const text = await response.text()
  console.debug('[festivalApi] response', path, response.status, text)
  if (!response.ok) {
    throw new Error(`Festival API error ${response.status}: ${text}`)
  }
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

function buildLocalUser(identity: string, publicKey: string): FestivalUser {
  const { name, email } = getProfile()
  return {
    id: 0,
    identity,
    public_key: publicKey,
    name,
    email,
    image_url: '',
    is_public: false,
  }
}

async function fetchSignedChallenge(user: FestivalUser): Promise<FestivalChallenge> {
  const challenge = await apiFetch<FestivalChallenge>(`api/v2/${EVENT}/challenge`, {
    method: 'POST',
    body: JSON.stringify({ user }),
  })
  const signature = await signChallenge(challenge.value)
  return { ...challenge, signature }
}

// Dedupe concurrent callers the same way as getOrCreateIdentity — otherwise two callers can both
// observe isRegistered() === false and both fire a redundant sendUser request.
let registrationPromise: Promise<void> | null = null

async function ensureRegistered(user: FestivalUser): Promise<void> {
  if (isRegistered()) return
  if (!registrationPromise) {
    registrationPromise = (async () => {
      const challenge = await fetchSignedChallenge(user)
      await apiFetch(`api/v2/${EVENT}/user`, {
        method: 'POST',
        body: JSON.stringify({ user, challenge }),
      })
      markRegistered()
    })().finally(() => {
      registrationPromise = null
    })
  }
  await registrationPromise
}

async function getLocalUser(): Promise<FestivalUser> {
  const { identity, publicKey } = await getOrCreateIdentity()
  if (!hasProfile()) setProfile(DEFAULT_NAME, DEFAULT_EMAIL)
  const user = buildLocalUser(identity, publicKey)
  await ensureRegistered(user)
  return user
}

export async function redeemFestivalQrCode(qr: FestivalQrCode): Promise<void> {
  const user = await getLocalUser()
  const challenge = await fetchSignedChallenge(user)
  await apiFetch(`api/v3/${EVENT}/favouritesAccess`, {
    method: 'PUT',
    body: JSON.stringify({ identity: qr.id, secret_challenge: qr.sc, user, challenge }),
  })
}

async function fetchOwnFavouriteDtos(): Promise<ArtistFavouriteDto[]> {
  const user = await getLocalUser()
  const challenge = await fetchSignedChallenge(user)
  return apiFetch<ArtistFavouriteDto[]>(`api/v3/${EVENT}/artistFavourites`, {
    method: 'POST',
    body: JSON.stringify({ user, challenge }),
  })
}

export async function fetchFriendFavouriteArtistIds(friendIdentity: string): Promise<number[]> {
  const dtos = await fetchOwnFavouriteDtos()
  return dtos
    .filter((dto) => dto.user?.identity === friendIdentity)
    .flatMap((dto) => dto.favourites.map((favourite) => favourite.artist_id))
}

export async function fetchArtists(): Promise<FestivalArtist[]> {
  // `time` is an incremental-sync cursor (last-synced timestamp), not a cache-buster — 0 requests the full list.
  return apiFetch<FestivalArtist[]>(`api/v3/${EVENT}/artists?time=0`)
}

