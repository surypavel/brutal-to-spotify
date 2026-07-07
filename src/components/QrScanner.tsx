import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Alert, Button, FileButton, Group, Stack, Text } from '@mantine/core'
import { IconCamera, IconUpload, IconX } from '@tabler/icons-react'

const SCANNER_ELEMENT_ID = 'qr-scanner-region'

interface QrScannerProps {
  onScan: (text: string) => void
}

export function QrScanner({ onScan }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current
      if (scanner?.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, [])

  async function stopCamera() {
    const scanner = scannerRef.current
    if (scanner?.isScanning) {
      await scanner.stop()
      scanner.clear()
    }
    setIsScanning(false)
  }

  async function startCamera() {
    setError(null)
    try {
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
      scannerRef.current = scanner
      setIsScanning(true)
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText)
          void stopCamera()
        },
        () => {},
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access the camera')
      setIsScanning(false)
    }
  }

  async function scanFile(file: File | null) {
    if (!file) return
    setError(null)
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
    try {
      const text = await scanner.scanFile(file, false)
      onScan(text)
    } catch {
      setError('No QR code found in that image')
    }
  }

  return (
    <Stack gap="md">
      <div id={SCANNER_ELEMENT_ID} style={{ width: '100%', maxWidth: 360, margin: '0 auto' }} />
      {error && (
        <Alert color="red" icon={<IconX size={16} />}>
          {error}
        </Alert>
      )}
      <Group justify="center">
        {!isScanning ? (
          <Button leftSection={<IconCamera size={16} />} onClick={() => void startCamera()}>
            Scan with camera
          </Button>
        ) : (
          <Button color="red" onClick={() => void stopCamera()}>
            Stop camera
          </Button>
        )}
        <FileButton onChange={(file) => void scanFile(file)} accept="image/*">
          {(props) => (
            <Button variant="light" leftSection={<IconUpload size={16} />} {...props}>
              Upload QR image
            </Button>
          )}
        </FileButton>
      </Group>
      <Text size="sm" c="dimmed" ta="center">
        Point your camera at a Brutal Assault badge QR code, or upload a photo of it.
      </Text>
    </Stack>
  )
}
