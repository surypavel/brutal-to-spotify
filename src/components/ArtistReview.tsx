import { useState } from 'react'
import { Badge, Button, Checkbox, Group, Stack, Text } from '@mantine/core'

export interface ReviewArtist {
  id: number
  name: string
}

interface ArtistReviewProps {
  friendName: string
  artists: ReviewArtist[]
  onConfirm: (artists: ReviewArtist[]) => void
  onRescan: () => void
}

export function ArtistReview({ friendName, artists, onConfirm, onRescan }: ArtistReviewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(artists.map((artist) => artist.id)))

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selected = artists.filter((artist) => selectedIds.has(artist.id))

  return (
    <Stack gap="md">
      <Text>
        <Text span fw={600}>
          {friendName || 'This person'}
        </Text>{' '}
        has favourited {artists.length} artist{artists.length === 1 ? '' : 's'}. Uncheck any you don't want in the
        playlist.
      </Text>

      <Stack gap="xs">
        {artists.map((artist) => (
          <Checkbox
            key={artist.id}
            label={artist.name}
            checked={selectedIds.has(artist.id)}
            onChange={() => toggle(artist.id)}
          />
        ))}
      </Stack>

      <Group justify="space-between">
        <Badge variant="light">
          {selected.length} artist{selected.length === 1 ? '' : 's'} selected
        </Badge>
        <Group>
          <Button variant="subtle" onClick={onRescan}>
            Rescan
          </Button>
          <Button disabled={selected.length === 0} onClick={() => onConfirm(selected)}>
            Continue
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}
