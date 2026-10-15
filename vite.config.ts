import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { port: 5173 },
  // wallet.html is the browser-wallet pairing page the desktop app opens in the user's browser.
  build: { rolldownOptions: { input: { main: path.resolve(import.meta.dirname, 'index.html'), wallet: path.resolve(import.meta.dirname, 'wallet.html') } } },
})
