import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/backend/**/*.test.{js,ts}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    singleThread: true,
    env: {
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-jwt-secret',
      REFRESH_SECRET: 'test-refresh-secret',
      NODE_ENV: 'test',
    },
  },
});
