import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1920, height: 1080 },
    trace: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        // Hardware WebGL on Windows; headless Chromium otherwise falls back to slow SwiftShader.
        launchOptions: {
          args: process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : [],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
