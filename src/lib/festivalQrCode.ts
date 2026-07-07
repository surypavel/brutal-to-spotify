export interface FestivalQrCode {
  id: string
  pk: string
  un: string
  iu: string
  sc: string
}

export function parseFestivalQrCode(raw: string): FestivalQrCode {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('QR code does not contain valid JSON')
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('QR code JSON is not an object')
  }

  const record = data as Record<string, unknown>
  const { id, pk, un, iu, sc } = record
  if (
    typeof id !== 'string' ||
    typeof pk !== 'string' ||
    typeof un !== 'string' ||
    typeof iu !== 'string' ||
    typeof sc !== 'string'
  ) {
    throw new Error('QR code is missing expected Brutal Assault fields (id, pk, un, iu, sc)')
  }

  return { id, pk, un, iu, sc }
}
