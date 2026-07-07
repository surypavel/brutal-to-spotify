import { Alert, Button, Stack, Text } from '@mantine/core'
import { IconBrandSpotify } from '@tabler/icons-react'
import * as spotifyAuth from '../lib/spotifyAuth'
import { savePendingLineup, type FriendLineup } from '../lib/friendLineup'

interface ConnectPageProps {
  friend: FriendLineup
}

export function ConnectPage({ friend }: ConnectPageProps) {
  function connectSpotify() {
    savePendingLineup(friend)
    void spotifyAuth.login()
  }

  return (
    <Stack gap="md">
      <Text>
        <Text span fw={600}>
          {friend.friendName}
        </Text>{' '}
        has {friend.artists.length} artist{friend.artists.length === 1 ? '' : 's'} for you! Connect Spotify to
        build the playlist.
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
    </Stack>
  )
}
