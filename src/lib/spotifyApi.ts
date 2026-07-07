import { z } from 'zod'
import { getValidAccessToken } from './spotifyAuth'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('Not logged in to Spotify')
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spotify API error ${response.status}: ${text}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface SpotifyArtist {
  id: string
  name: string
}

export interface SpotifyTrack {
  id: string
  uri: string
  name: string
}

export async function findArtist(name: string): Promise<SpotifyArtist | null> {
  const params = new URLSearchParams({ q: `artist:"${name}"`, type: 'artist', limit: '10' })
  const data = await apiFetch<{ artists: { items: SpotifyArtist[] } }>(`/search?${params.toString()}`)
  const items = data.artists.items
  const exactMatch = items.find((artist) => artist.name.toLowerCase() === name.toLowerCase())
  return exactMatch ?? items[0] ?? null
}

interface SearchTrackResult extends SpotifyTrack {
  popularity: number
  artists: { id: string }[]
}

// Spotify's dedicated "Get Artist's Top Tracks" endpoint is deprecated (and now 403s outright), so
// approximate it: search for tracks credited to this artist and rank by popularity ourselves.
export async function getArtistTopTracks(artist: SpotifyArtist, limit = 3): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ q: `artist:"${artist.name}"`, type: 'track', limit: String(limit) })
  const data = await apiFetch<{ tracks: { items: SearchTrackResult[] } }>(`/search?${params.toString()}`)
  return data.tracks.items
    .filter((track) => track.artists.some((trackArtist) => trackArtist.id === artist.id))
    .sort((a, b) => b.popularity - a.popularity)
}

export async function createPlaylist(
  name: string,
  description: string,
): Promise<{ id: string; external_urls: { spotify: string } }> {
  return apiFetch('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  })
}

// Spotify renamed these from /tracks to /items (the /tracks path is deprecated and now 403s).
export async function addTracksToPlaylist(playlistId: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100)
    await apiFetch(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk }),
    })
  }
}

// PUT replaces a playlist's entire contents with the first 100 URIs; any remainder is appended after.
export async function replacePlaylistTracks(playlistId: string, uris: string[]): Promise<void> {
  await apiFetch(`/playlists/${playlistId}/items`, {
    method: 'PUT',
    body: JSON.stringify({ uris: uris.slice(0, 100) }),
  })
  if (uris.length > 100) {
    await addTracksToPlaylist(playlistId, uris.slice(100))
  }
}

interface PlaylistItemsPage {
  items: { item: { uri: string } | null }[]
  next: string | null
}

// Shape of getPlaylistTrackUris's result, exported so callers can validate it after reading it back
// out of react-query's localStorage-persisted cache (which may hold a stale/incompatible shape from
// a previous build of this app).
export const playlistTrackUrisSchema = z.array(z.string())

// The newer /items path (unlike the deprecated /tracks path it replaces) nests each track under
// an "item" key, not "track".
export async function getPlaylistTrackUris(playlistId: string): Promise<string[]> {
  const uris: string[] = []
  let path: string | null = `/playlists/${playlistId}/items?fields=items(item(uri)),next&limit=100`
  while (path) {
    const data: PlaylistItemsPage = await apiFetch(path)
    for (const entry of data.items) {
      if (entry.item) uris.push(entry.item.uri)
    }
    path = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null
  }
  return uris
}
