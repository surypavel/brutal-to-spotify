import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/festival-api': {
        target: 'https://admin.best4fest.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/festival-api/, ''),
      },
    },
  },
})
