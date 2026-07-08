import { Alert, Badge, Button, Group, Stack, Text, Title } from '@mantine/core'
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
      <Stack gap={4}>
        <Title order={3} tt="uppercase">
          {friend.friendName}&apos;s lineup
        </Title>
        <Text c="dimmed" size="sm">
          {friend.artists.length} favourited artist{friend.artists.length === 1 ? '' : 's'} found. Connect your
          Spotify account to match their top tracks and build the playlist.
        </Text>
      </Stack>

      <Group gap={6}>
        {friend.artists.map((artist) => (
          <Badge key={artist.id} variant="light" color="gold">
            {artist.name}
          </Badge>
        ))}
      </Group>

      {!spotifyAuth.isConfigured() && (
        <Alert color="yellow">
          Missing VITE_SPOTIFY_CLIENT_ID. Set it in .env.local (see README) before connecting to Spotify.
        </Alert>
      )}

      <Button
        size="md"
        leftSection={<IconBrandSpotify size={20} />}
        disabled={!spotifyAuth.isConfigured()}
        onClick={connectSpotify}
      >
        Connect Spotify
      </Button>
    </Stack>
  )
}
