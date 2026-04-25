import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/renderer/shared'),
      '@schema': path.resolve(__dirname, 'src/shared/schema/index.ts'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        floating: path.resolve(__dirname, 'src/renderer/floating/index.html'),
        freeze:   path.resolve(__dirname, 'src/renderer/freeze/index.html'),
        notes:    path.resolve(__dirname, 'src/renderer/notes/index.html'),
      },
    },
  },
  server: {
    port: 7331,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
