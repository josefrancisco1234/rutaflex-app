import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // En desarrollo, /api se reenvía al backend PHP (php -S localhost:8000 -t backend/public backend/public/index.php).
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
