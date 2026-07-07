import { useEffect, useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { Alert, Anchor, Badge, Button, Container, Group, List, Loader, Stack, Text, Title } from '@mantine/core'
import { IconBrandSpotify, IconMusic } from '@tabler/icons-react'
import { QrScanner } from './components/QrScanner'
import { ArtistReview, type ReviewArtist } from './components/ArtistReview'
import { parseFestivalQrCode } from './lib/festivalQrCode'
import {
  fetchArtists,
  fetchFriendFavouriteArtistIds,
  redeemFestivalQrCode,
  resetFestivalIdentity,
  type FestivalArtist,
} from './lib/festivalApi'
import { ARTISTS_QUERY_KEY } from './lib/queryKeys'
import { clearCurrentFriend, getCurrentFriend, setCurrentFriend, setCurrentFriendPlaylist } from './lib/currentFriend'
import * as spotifyAuth from './lib/spotifyAuth'
import * as spotifyApi from './lib/spotifyApi'

type Step = 'scan' | 'review' | 'connect' | 'preview'

interface ScannedFriend {
  identity: string
  friendName: string
  artists: ReviewArtist[]
}

interface SpotifyMatch {
  queriedArtist: string
  matchedArtist: string | null
  tracks: spotifyApi.SpotifyTrack[]
}

const PENDING_SELECTION_KEY = 'pending_playlist_selection'

interface PendingSelection {
  scanned: ScannedFriend
  selectedArtists: ReviewArtist[]
}

function savePendingSelection(selection: PendingSelection): void {
  sessionStorage.setItem(PENDING_SELECTION_KEY, JSON.stringify(selection))
}

function takePendingSelection(): PendingSelection | null {
  const raw = sessionStorage.getItem(PENDING_SELECTION_KEY)
  if (!raw) return null
  sessionStorage.removeItem(PENDING_SELECTION_KEY)
  return JSON.parse(raw) as PendingSelection
}

function resolveArtistNames(artistIds: number[], artists: FestivalArtist[]): ReviewArtist[] {
  const artistsById = new Map(artists.map((artist) => [artist.id, artist.name]))
  return artistIds
    .map((id) => ({ id, name: artistsById.get(id) }))
    .filter((artist): artist is ReviewArtist => Boolean(artist.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function App() {
  const queryClient = useQueryClient()
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [step, setStep] = useState<Step>('scan')
  const [scanned, setScanned] = useState<ScannedFriend | null>(null)
  const [selectedArtists, setSelectedArtists] = useState<ReviewArtist[]>([])

  const [loggedIn, setLoggedIn] = useState(spotifyAuth.isLoggedIn())
  const [authError, setAuthError] = useState<string | null>(null)

  // On first load: finish any Spotify OAuth redirect in progress (restoring whatever selection was
  // in flight before it), otherwise resume the locally-remembered friend, if any.
  useEffect(() => {
    async function bootstrap() {
      try {
        const didLogin = await spotifyAuth.handleRedirectCallback()
        if (didLogin) {
          setLoggedIn(true)
          const pending = takePendingSelection()
          if (pending) {
            setScanned(pending.scanned)
            setSelectedArtists(pending.selectedArtists)
            setStep('preview')
            return
          }
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : String(err))
        return
      } finally {
        setIsBootstrapping(false)
      }

      const currentFriend = getCurrentFriend()
      if (!currentFriend) return
      try {
        const favouriteIds = await fetchFriendFavouriteArtistIds(currentFriend.identity)
        const artists = await queryClient.fetchQuery({ queryKey: ARTISTS_QUERY_KEY, queryFn: fetchArtists })
        const resolved = resolveArtistNames(favouriteIds, artists)
        setScanned({ identity: currentFriend.identity, friendName: currentFriend.name, artists: resolved })
        setStep('review')
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : String(err))
      }
    }
    void bootstrap()
  }, [])

  const scanMutation = useMutation({
    mutationFn: async (text: string) => {
      const qr = parseFestivalQrCode(text)
      await redeemFestivalQrCode(qr)
      const favouriteIds = await fetchFriendFavouriteArtistIds(qr.id)
      const artists = await queryClient.fetchQuery({ queryKey: ARTISTS_QUERY_KEY, queryFn: fetchArtists })
      const resolved = resolveArtistNames(favouriteIds, artists)
      if (resolved.length === 0) {
        throw new Error(
          "No favourited artists found for this QR code. It may have expired — QR codes in the app are single-use and refresh often, so a photo of one may no longer be valid.",
        )
      }
      return { identity: qr.id, friendName: qr.un, artists: resolved } satisfies ScannedFriend
    },
    onSuccess: (result) => {
      setCurrentFriend(result.identity, result.friendName)
      setScanned(result)
      setStep('review')
    },
  })

  function handleConfirmArtists(confirmed: ReviewArtist[]) {
    setSelectedArtists(confirmed)
    setStep(loggedIn ? 'preview' : 'connect')
  }

  function connectSpotify() {
    if (scanned) savePendingSelection({ scanned, selectedArtists })
    void spotifyAuth.login()
  }

  // Cached per artist name (persisted to localStorage via the query client) so revisiting this
  // friend doesn't re-hit Spotify's undisclosed rate limit for artists we've already resolved.
  const spotifyMatches = useQueries({
    queries: selectedArtists.map((artist) => ({
      queryKey: ['spotifyTrackMatch', artist.name],
      queryFn: async (): Promise<SpotifyMatch> => {
        const spotifyArtist = await spotifyApi.findArtist(artist.name)
        if (!spotifyArtist) {
          return { queriedArtist: artist.name, matchedArtist: null, tracks: [] }
        }
        const tracks = await spotifyApi.getArtistTopTracks(spotifyArtist)
        return { queriedArtist: artist.name, matchedArtist: spotifyArtist.name, tracks }
      },
      enabled: step === 'preview',
    })),
  })

  const isResolvingTracks = spotifyMatches.some((query) => query.isLoading)
  const resolvedTrackUris = spotifyMatches.flatMap((query) => query.data?.tracks.map((track) => track.uri) ?? [])
  const currentFriendStored = scanned ? getCurrentFriend() : null
  const existingPlaylist =
    currentFriendStored?.playlistId && currentFriendStored.playlistUrl
      ? { id: currentFriendStored.playlistId, url: currentFriendStored.playlistUrl }
      : null

  const playlistMutation = useMutation({
    mutationFn: async () => {
      if (!scanned) throw new Error('No friend selected')
      if (resolvedTrackUris.length === 0) throw new Error('No tracks were found for any of the artists.')
      if (existingPlaylist) {
        await spotifyApi.replacePlaylistTracks(existingPlaylist.id, resolvedTrackUris)
        return existingPlaylist
      }
      const playlist = await spotifyApi.createPlaylist(
        `${scanned.friendName}'s Brutal Assault Lineup`,
        'Generated from a Brutal Assault badge QR code.',
      )
      const stored = { id: playlist.id, url: playlist.external_urls.spotify }
      // Persist before adding tracks: if that step fails, a retry should replace items on this
      // already-created playlist rather than creating another orphaned empty one.
      setCurrentFriendPlaylist(stored.id, stored.url)
      await spotifyApi.addTracksToPlaylist(playlist.id, resolvedTrackUris)
      return stored
    },
  })

  function backToScan() {
    setStep('scan')
    setScanned(null)
    setSelectedArtists([])
    scanMutation.reset()
    playlistMutation.reset()
  }

  function switchAccount() {
    const confirmed = window.confirm(
      "Switch accounts? This clears your local festival identity and Spotify connection — you'll need to reconnect and re-scan a QR code.",
    )
    if (!confirmed) return
    resetFestivalIdentity()
    clearCurrentFriend()
    spotifyAuth.logout()
    setLoggedIn(false)
    backToScan()
  }

  if (isBootstrapping) {
    return (
      <Container size="sm" py="xl">
        <Group>
          <Loader size="sm" />
          <Text size="sm">Loading…</Text>
        </Group>
      </Container>
    )
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group gap="xs">
          <IconMusic size={28} />
          <Title order={2}>Brutal Assault → Spotify</Title>
        </Group>
        <Text c="dimmed">Scan a festival badge QR code and turn its favourited artists into a Spotify playlist.</Text>

        {authError && <Alert color="red">{authError}</Alert>}

        {step === 'scan' && (
          <Stack gap="md">
            {scanMutation.isError && <Alert color="red">{(scanMutation.error as Error).message}</Alert>}
            {scanMutation.isPending ? (
              <Group>
                <Loader size="sm" />
                <Text size="sm">Redeeming QR code and fetching favourited artists…</Text>
              </Group>
            ) : (
              <QrScanner onScan={(text) => scanMutation.mutate(text)} />
            )}
          </Stack>
        )}

        {step === 'review' && scanned && (
          <ArtistReview
            friendName={scanned.friendName}
            artists={scanned.artists}
            onConfirm={handleConfirmArtists}
            onRescan={backToScan}
          />
        )}

        {step === 'connect' && (
          <Stack gap="md">
            <Text>
              <Text span fw={600}>
                {scanned?.friendName}
              </Text>{' '}
              has {selectedArtists.length} artist{selectedArtists.length === 1 ? '' : 's'} for you! Connect Spotify
              to build the playlist.
            </Text>

            {!spotifyAuth.isConfigured() && (
              <Alert color="yellow">
                Missing VITE_SPOTIFY_CLIENT_ID. Set it in .env.local (see README) before connecting to Spotify.
              </Alert>
            )}

            <Button
              leftSection={<IconBrandSpotify size={16} />}
              disabled={!spotifyAuth.isConfigured()}
              onClick={connectSpotify}
            >
              Connect Spotify
            </Button>

            <Button variant="subtle" onClick={backToScan}>
              Cancel
            </Button>
          </Stack>
        )}

        {step === 'preview' && scanned && (
          <Stack gap="md">
            {isResolvingTracks && (
              <Group>
                <Loader size="sm" />
                <Text size="sm">Matching artists on Spotify…</Text>
              </Group>
            )}

            <Stack gap="sm">
              {spotifyMatches.map((query, index) => {
                const artist = selectedArtists[index]
                const data = query.data
                return (
                  <div key={artist.id}>
                    <Group gap="xs">
                      <Text fw={600} size="sm">
                        {artist.name}
                      </Text>
                      {query.isLoading && <Loader size="xs" />}
                      {data && data.matchedArtist === null && (
                        <Badge color="gray" variant="light">
                          not found on Spotify
                        </Badge>
                      )}
                      {data &&
                        data.matchedArtist !== null &&
                        data.matchedArtist.toLowerCase() !== artist.name.toLowerCase() && (
                          <Badge color="yellow" variant="light">
                            matched: {data.matchedArtist}
                          </Badge>
                        )}
                    </Group>
                    {data && data.tracks.length > 0 && (
                      <List size="sm" spacing={2} ml="md">
                        {data.tracks.map((track) => (
                          <List.Item key={track.id}>{track.name}</List.Item>
                        ))}
                      </List>
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
                disabled={resolvedTrackUris.length === 0}
              >
                {existingPlaylist ? 'Update playlist' : 'Create playlist'} ({resolvedTrackUris.length} track
                {resolvedTrackUris.length === 1 ? '' : 's'})
              </Button>
            )}

            {playlistMutation.isError && <Alert color="red">{(playlistMutation.error as Error).message}</Alert>}

            {playlistMutation.isSuccess && (
              <Alert color="green">
                Playlist {existingPlaylist ? 'updated' : 'created'}!{' '}
                <Anchor href={playlistMutation.data.url} target="_blank" rel="noreferrer">
                  Open it on Spotify
                </Anchor>
              </Alert>
            )}

            <Button
              variant="subtle"
              size="xs"
              c="dimmed"
              onClick={() => {
                spotifyAuth.logout()
                setLoggedIn(false)
              }}
            >
              Disconnect Spotify
            </Button>

            <Button variant="subtle" onClick={backToScan}>
              Start over
            </Button>
          </Stack>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" size="xs" c="dimmed" onClick={switchAccount}>
            Switch account
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}

export default App
