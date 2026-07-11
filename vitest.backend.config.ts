import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/backend/**/*.test.{js,ts}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Arquivos de teste rodam em sequência: compartilham a instância do
    // mongodb-memory-server (substitui o antigo singleThread do vitest <4).
    fileParallelism: false,
    env: {
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-jwt-secret',
      REFRESH_SECRET: 'test-refresh-secret',
      NODE_ENV: 'test',
    },
  },
});
