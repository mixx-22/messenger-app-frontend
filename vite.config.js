import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isElectronBuild = process.env.ELECTRON_BUILD === '1' || env.ELECTRON_BUILD === '1'
  const backend = env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:4000'

  const proxy = {
    '/api': { target: backend, changeOrigin: true },
    '/uploads': { target: backend, changeOrigin: true },
    '/socket.io': { target: backend, ws: true, changeOrigin: true },
  }

  return {
    base: isElectronBuild ? './' : '/',
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 80,
      proxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 80,
      proxy,
    },
  }
})
