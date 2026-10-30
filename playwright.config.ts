import { defineConfig, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const channel = process.env.PLAYWRIGHT_CHANNEL ?? (existsSync(chromium.executablePath()) ? undefined
  : existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? 'msedge' : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', channel },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
