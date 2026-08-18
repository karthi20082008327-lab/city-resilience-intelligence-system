import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const certPath = path.resolve(__dirname, 'certs/key.pem')
const httpsEnabled = fs.existsSync(certPath)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    ...(httpsEnabled
      ? {
          https: {
            key: fs.readFileSync(path.resolve(__dirname, 'certs/key.pem')),
            cert: fs.readFileSync(path.resolve(__dirname, 'certs/cert.pem')),
          },
        }
      : {}),
    proxy: {
      '/api': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'wss://localhost:8000',
        ws: true,
        secure: false,
      },
      '/uploads': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
