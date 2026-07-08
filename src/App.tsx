import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Badge, Button, Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { ScanPage } from './pages/ScanPage'
import { ConnectPage } from './pages/ConnectPage'
import { PreviewPage } from './pages/PreviewPage'
import { fetchFriendLineup, takePendingLineup, type FriendLineup } from './lib/friendLineup'
import { resetFestivalIdentity } from './lib/festivalApi'
import { clearCurrentFriend, getCurrentFriend, setCurrentFriend } from './lib/currentFriend'
import * as spotifyAuth from './lib/spotifyAuth'

const STEPS = ['Scan badge', 'Connect Spotify', 'Build playlist']

function StepIndicator({ current }: { current: number }) {
  return (
    <Group gap="xs">
      {STEPS.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'todo'
        return (
          <Badge
            key={label}
            variant={state === 'active' ? 'filled' : state === 'done' ? 'light' : 'outline'}
            color={state === 'todo' ? 'gray' : index === 0 ? 'gold' : 'spotify'}
            leftSection={state === 'done' ? <IconCheck size={12} /> : undefined}
          >
            {index + 1}. {label}
          </Badge>
        )
      })}
    </Group>
  )
}

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
          <Loader size="sm" color="gold" />
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        </Group>
      </Container>
    )
  }

  const currentStep = !friend ? 0 : !loggedIn ? 1 : 2

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Stack gap="sm">
          <Title order={1} fz={{ base: 38, sm: 52 }} lh={1.05} tt="uppercase">
            <span className="brand-gold">Brutal Assault</span>{' '}
            <span className="brand-green" style={{ whiteSpace: 'nowrap' }}>
              → Spotify
            </span>
          </Title>
          <StepIndicator current={currentStep} />
        </Stack>

        {bootstrapError && <Alert color="red">{bootstrapError}</Alert>}

        <Paper withBorder radius="lg" p="lg" bg="dark.6">
          {!friend ? (
            <ScanPage onScanned={handleScanned} />
          ) : !loggedIn ? (
            <ConnectPage friend={friend} />
          ) : (
            <PreviewPage friend={friend} />
          )}
        </Paper>

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Unofficial fan tool — not affiliated with Brutal Assault or Spotify.
          </Text>
          <Button variant="subtle" color="gray" size="xs" onClick={switchAccount}>
            Switch account
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}

export default App
