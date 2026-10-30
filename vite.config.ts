import { defineConfig } from 'vite'

// Die Seite liegt an der Wurzel von https://dorfkrieg.micana.de
export default defineConfig({
  base: '/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
