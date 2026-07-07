import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconMusic } from '@tabler/icons-react'
import { ScanPage } from './pages/ScanPage'
import { ConnectPage } from './pages/ConnectPage'
import { PreviewPage } from './pages/PreviewPage'
import { fetchFriendLineup, takePendingLineup, type FriendLineup } from './lib/friendLineup'
import { resetFestivalIdentity } from './lib/festivalApi'
import { clearCurrentFriend, getCurrentFriend, setCurrentFriend } from './lib/currentFriend'
import * as spotifyAuth from './lib/spotifyAuth'

// The app is three pages resolved from two facts: no friend yet → scan; friend but no Spotify
// session → connect; both → preview.
function App() {
  const queryClient = useQueryClient()
  const [friend, setFriend] = useState<FriendLineup | null>(null)
  const [loggedIn, setLoggedIn] = useState(spotifyAuth.isLoggedIn())
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  // On first load: finish any Spotify OAuth redirect in progress (restoring whatever lineup was
  // in flight before it), otherwise resume the locally-remembered friend, if any.
  useEffect(() => {
    async function bootstrap() {
      try {
        const didLogin = await spotifyAuth.handleRedirectCallback()
        if (didLogin) {
          setLoggedIn(true)
          const pending = takePendingLineup()
          if (pending) {
            setFriend(pending)
            return
          }
        }
        const stored = getCurrentFriend()
        if (stored) {
          setFriend(await fetchFriendLineup(queryClient, stored.identity, stored.name))
        }
      } catch (err) {
        setBootstrapError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsBootstrapping(false)
      }
    }
    void bootstrap()
  }, [queryClient])

  function handleScanned(lineup: FriendLineup) {
    setCurrentFriend(lineup.identity, lineup.friendName)
    setFriend(lineup)
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
    setFriend(null)
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

        {bootstrapError && <Alert color="red">{bootstrapError}</Alert>}

        {!friend ? (
          <ScanPage onScanned={handleScanned} />
        ) : !loggedIn ? (
          <ConnectPage friend={friend} />
        ) : (
          <PreviewPage friend={friend} />
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
