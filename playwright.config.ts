import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', use: { ...devices['iPhone 13'], baseURL: 'http://localhost:3000' }, webServer: { command: './scripts/e2e-server.sh', url: 'http://127.0.0.1:3000', reuseExistingServer: true } });
