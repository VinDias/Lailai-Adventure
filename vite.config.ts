
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['services/**', 'components/**'] }
  },
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});
