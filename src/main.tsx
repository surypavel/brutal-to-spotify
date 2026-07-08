import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.tsx'
import { theme } from './theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Artist catalogs and festival favourites don't change minute-to-minute — avoid re-querying
      // (and burning Spotify's undisclosed rate limit) every time a component remounts.
      staleTime: 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
})

const persister = createAsyncStoragePersister({ storage: window.localStorage })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <MantineProvider theme={theme} forceColorScheme="dark">
        <App />
      </MantineProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
