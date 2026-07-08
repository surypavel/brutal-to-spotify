import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { QrScanner } from '../components/QrScanner'
import { parseFestivalQrCode } from '../lib/festivalQrCode'
import { redeemFestivalQrCode } from '../lib/festivalApi'
import { fetchFriendLineup, type FriendLineup } from '../lib/friendLineup'

interface ScanPageProps {
  onScanned: (lineup: FriendLineup) => void
}

export function ScanPage({ onScanned }: ScanPageProps) {
  const queryClient = useQueryClient()

  const scanMutation = useMutation({
    mutationFn: async (text: string) => {
      const qr = parseFestivalQrCode(text)
      await redeemFestivalQrCode(qr)
      const lineup = await fetchFriendLineup(queryClient, qr.id, qr.un)
      if (lineup.artists.length === 0) {
        throw new Error(
          'No favourited artists found for this QR code. It may have expired — QR codes in the app are single-use and refresh often, so a photo of one may no longer be valid.',
        )
      }
      return lineup
    },
    onSuccess: onScanned,
  })

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={3} tt="uppercase">
          Scan badge
        </Title>
        <Text c="dimmed" size="sm">
          Scan the QR code from a Brutal Assault app badge — yours or a friend&apos;s — and its favourited artists
          become a Spotify playlist. Codes refresh often, so a live scan beats an old screenshot.
        </Text>
      </Stack>

      {scanMutation.isError && <Alert color="red">{scanMutation.error.message}</Alert>}
      {scanMutation.isPending ? (
        <Group>
          <Loader size="sm" color="gold" />
          <Text size="sm">Redeeming QR code and fetching favourited artists…</Text>
        </Group>
      ) : (
        <QrScanner onScan={(text) => scanMutation.mutate(text)} />
      )}
    </Stack>
  )
}
