import type { QueryClient } from '@tanstack/react-query'
import { fetchArtists, fetchFriendFavouriteArtistIds } from './festivalApi'
import { ARTISTS_QUERY_KEY } from './queryKeys'

export interface LineupArtist {
  id: number
  name: string
}

export interface FriendLineup {
  identity: string
  friendName: string
  artists: LineupArtist[]
}

export async function fetchFriendLineup(
  queryClient: QueryClient,
  identity: string,
  friendName: string,
): Promise<FriendLineup> {
  const favouriteIds = await fetchFriendFavouriteArtistIds(identity)
  const artists = await queryClient.fetchQuery({ queryKey: ARTISTS_QUERY_KEY, queryFn: fetchArtists })
  const artistNamesById = new Map(artists.map((artist) => [artist.id, artist.name]))
  const lineupArtists = favouriteIds
    .map((id) => ({ id, name: artistNamesById.get(id) }))
    .filter((artist): artist is LineupArtist => Boolean(artist.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { identity, friendName, artists: lineupArtists }
}

// Spotify OAuth login navigates away from the app; stash the scanned lineup so the redirect
// back can land straight on the preview page instead of asking for a re-scan.
const PENDING_LINEUP_KEY = 'pending_playlist_selection'

export function savePendingLineup(lineup: FriendLineup): void {
  sessionStorage.setItem(PENDING_LINEUP_KEY, JSON.stringify(lineup))
}

export function takePendingLineup(): FriendLineup | null {
  const raw = sessionStorage.getItem(PENDING_LINEUP_KEY)
  if (!raw) return null
  sessionStorage.removeItem(PENDING_LINEUP_KEY)
  return JSON.parse(raw) as FriendLineup
}
