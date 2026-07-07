import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Group, Loader, Stack, Text } from '@mantine/core'
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
      {scanMutation.isError && <Alert color="red">{scanMutation.error.message}</Alert>}
      {scanMutation.isPending ? (
        <Group>
          <Loader size="sm" />
          <Text size="sm">Redeeming QR code and fetching favourited artists…</Text>
        </Group>
      ) : (
        <QrScanner onScan={(text) => scanMutation.mutate(text)} />
      )}
    </Stack>
  )
}
