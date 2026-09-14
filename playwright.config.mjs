import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['packages/playercore/tests/*.spec.mjs', 'tests/*.spec.mjs'],
  timeout: 30000,
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: ['source', 'bundle'].map(name => ({ name })),
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
});
