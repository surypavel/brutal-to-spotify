import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Alert, Anchor, Badge, Button, Checkbox, Group, Loader, Stack, Text } from '@mantine/core'
import { IconBrandSpotify } from '@tabler/icons-react'
import { getCurrentFriend, setCurrentFriendPlaylist } from '../lib/currentFriend'
import * as spotifyApi from '../lib/spotifyApi'
import type { FriendLineup } from '../lib/friendLineup'

interface SpotifyMatch {
  matchedArtist: string | null
  tracks: spotifyApi.SpotifyTrack[]
}

interface Playlist {
  id: string
  url: string
}

function readStoredPlaylist(): Playlist | null {
  const friend = getCurrentFriend()
  if (!friend?.playlistId || !friend.playlistUrl) return null
  return { id: friend.playlistId, url: friend.playlistUrl }
}

interface PreviewPageProps {
  friend: FriendLineup
}

export function PreviewPage({ friend }: PreviewPageProps) {
  // `initialPlaylist` is snapshotted at mount and only used to seed checkbox defaults — they must
  // not re-derive against the playlist this page itself creates or rewrites. `playlist` is the
  // live mutation target and can be set mid-flight by a create.
  const [initialPlaylist] = useState(readStoredPlaylist)
  const [playlist, setPlaylist] = useState(initialPlaylist)
  // Explicit user checks/unchecks, layered over the data-derived defaults below.
  const [trackOverrides, setTrackOverrides] = useState<ReadonlyMap<string, boolean>>(new Map())

  // Cached per artist name (persisted to localStorage via the query client) so revisiting this
  // friend doesn't re-hit Spotify's undisclosed rate limit for artists we've already resolved.
  const matchQueries = useQueries({
    queries: friend.artists.map((artist) => ({
      queryKey: ['spotifyTrackMatch', artist.name],
      queryFn: async (): Promise<SpotifyMatch> => {
        const spotifyArtist = await spotifyApi.findArtist(artist.name)
        if (!spotifyArtist) return { matchedArtist: null, tracks: [] }
        const tracks = await spotifyApi.getArtistTopTracks(spotifyArtist)
        return { matchedArtist: spotifyArtist.name, tracks }
      },
    })),
  })

  // staleTime: 0 overrides the app-wide 1hr default (main.tsx) — that default suits the festival
  // artist/favourites data, which barely changes, but this query's entire point is to reflect the
  // playlist's *current* contents, so a persisted-cache hit must always be revalidated, never
  // trusted as "fresh" on its own.
  const playlistTracksQuery = useQuery({
    queryKey: ['playlistTrackUris', initialPlaylist?.id],
    queryFn: () => spotifyApi.getPlaylistTrackUris(initialPlaylist!.id),
    enabled: Boolean(initialPlaylist),
    staleTime: 0,
  })

  // react-query's cache is persisted to localStorage as JSON, so data read back from it may not
  // match this query's current return shape (e.g. an older build of this app cached a Set here,
  // which round-trips through JSON as `{}`) — validate before trusting it.
  const initialPlaylistUris = useMemo(() => {
    const parsed = spotifyApi.playlistTrackUrisSchema.safeParse(playlistTracksQuery.data)
    return new Set(parsed.success ? parsed.data : [])
  }, [playlistTracksQuery.data])

  // When updating an already-created playlist, checkboxes default to whatever's already in it
  // rather than to "all checked" — otherwise re-visiting a friend would re-add tracks they
  // removed. If the contents lookup errors, fall back to checked rather than blocking forever.
  function isChecked(uri: string): boolean {
    const override = trackOverrides.get(uri)
    if (override !== undefined) return override
    return initialPlaylist && playlistTracksQuery.isSuccess ? initialPlaylistUris.has(uri) : true
  }

  function toggleTrack(uri: string) {
    setTrackOverrides((prev) => new Map(prev).set(uri, !isChecked(uri)))
  }

  const checkedTrackUris = matchQueries
    .flatMap((query) => query.data?.tracks ?? [])
    .map((track) => track.uri)
    .filter(isChecked)

  const isResolvingTracks =
    matchQueries.some((query) => query.isLoading) || (Boolean(initialPlaylist) && playlistTracksQuery.isFetching)

  const playlistMutation = useMutation({
    mutationFn: async (): Promise<{ playlist: Playlist; created: boolean }> => {
      if (checkedTrackUris.length === 0) throw new Error('No tracks selected.')
      if (playlist) {
        await spotifyApi.replacePlaylistTracks(playlist.id, checkedTrackUris)
        return { playlist, created: false }
      }
      const created = await spotifyApi.createPlaylist(
        `${friend.friendName}'s Brutal Assault Lineup`,
        'Generated from a Brutal Assault badge QR code.',
      )
      const stored = { id: created.id, url: created.external_urls.spotify }
      // Persist before adding tracks: if that step fails, a retry should replace items on this
      // already-created playlist rather than creating another orphaned empty one.
      setCurrentFriendPlaylist(stored.id, stored.url)
      setPlaylist(stored)
      await spotifyApi.addTracksToPlaylist(stored.id, checkedTrackUris)
      return { playlist: stored, created: true }
    },
  })

  return (
    <Stack gap="md">
      {isResolvingTracks && (
        <Group>
          <Loader size="sm" />
          <Text size="sm">Matching artists on Spotify…</Text>
        </Group>
      )}

      <Stack gap="sm">
        {friend.artists.map((artist, index) => {
          const match = matchQueries[index]
          return (
            <div key={artist.id}>
              <Group gap="xs">
                <Text fw={600} size="sm">
                  {artist.name}
                </Text>
                {match.isLoading && <Loader size="xs" />}
                {match.data?.matchedArtist === null && (
                  <Badge color="gray" variant="light">
                    not found on Spotify
                  </Badge>
                )}
                {match.data?.matchedArtist != null &&
                  match.data.matchedArtist.toLowerCase() !== artist.name.toLowerCase() && (
                    <Badge color="yellow" variant="light">
                      matched: {match.data.matchedArtist}
                    </Badge>
                  )}
              </Group>
              {match.data && match.data.tracks.length > 0 && (
                <Stack gap={2} ml="md">
                  {match.data.tracks.map((track) => (
                    <Checkbox
                      key={track.id}
                      size="sm"
                      label={track.name}
                      checked={isChecked(track.uri)}
                      onChange={() => toggleTrack(track.uri)}
                    />
                  ))}
                </Stack>
              )}
            </div>
          )
        })}
      </Stack>

      {!isResolvingTracks && (
        <Button
          leftSection={<IconBrandSpotify size={16} />}
          onClick={() => playlistMutation.mutate()}
          loading={playlistMutation.isPending}
          disabled={checkedTrackUris.length === 0}
        >
          {playlist ? 'Update playlist' : 'Create playlist'} ({checkedTrackUris.length} track
          {checkedTrackUris.length === 1 ? '' : 's'})
        </Button>
      )}

      {playlistMutation.isError && <Alert color="red">{playlistMutation.error.message}</Alert>}

      {playlistMutation.isSuccess && (
        <Alert color="green">
          Playlist {playlistMutation.data.created ? 'created' : 'updated'}!{' '}
          <Anchor href={playlistMutation.data.playlist.url} target="_blank" rel="noreferrer">
            Open it on Spotify
          </Anchor>
        </Alert>
      )}
    </Stack>
  )
}
