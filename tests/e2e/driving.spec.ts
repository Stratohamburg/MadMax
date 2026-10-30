import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('客户端可加载并绘制画布', async ({ page, browser }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('MadMax · 驾驶验证场');
  await expect(page.locator('#world')).toBeVisible();
  expect(await page.locator('#world').evaluate((canvas: HTMLCanvasElement) => !!canvas.getContext('2d'))).toBe(true);
  const directory = 'openspec/changes/validate-driving-prototype/evidence/vehicle-physics-1/browser-regression';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/browser.json`, JSON.stringify({ browserVersion: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent), node: process.version, platform: process.platform,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? '自动选择已下载 Chromium 或本机 Edge', realPhone: false }, null, 2) + '\n');
});
