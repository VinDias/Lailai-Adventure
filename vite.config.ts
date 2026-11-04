
// defineConfig do vitest/config inclui a tipagem do bloco `test` —
// o do 'vite' puro não conhece a chave e quebra o typecheck.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    // Sem limite, o Vitest sobe um worker por núcleo; com o servidor de
    // desenvolvimento carregado (outros projetos), 9 arquivos nem iniciaram em
    // 04/11/2026 ("Timeout waiting for worker to respond"). Com 4 a rodada
    // calma leva ~40 s e não depende de a máquina estar ociosa.
    maxWorkers: 4,
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
