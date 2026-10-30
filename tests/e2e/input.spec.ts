import { test, expect } from '@playwright/test';
import { start, snapshot, drag } from './helpers';

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: viewport.width === 390 ? 3 : 1 });
    test('布局、安全区、全向漂移、真实指针捕获与尺寸变化清理', async ({ page }) => {
      const geometry = await start(page);
      const view = await page.locator('#game-view').boundingBox();
      expect(view!.height).toBeGreaterThanOrEqual(viewport.height * 0.6 - 0.1);
      await page.evaluate(() => document.documentElement.style.setProperty('--safe-bottom', '34px'));
      await expect.poll(async () => (await snapshot(page)).geometry.enter).toBeLessThan(geometry.enter);
      const g = (await snapshot(page)).geometry;
      const control = await page.locator('#controls').boundingBox();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const x = g.x + Math.cos(angle) * (g.enter + 1);
        const y = g.y + Math.sin(angle) * (g.enter + 1);
        expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(viewport.width);
        expect(y).toBeGreaterThan(control!.y); expect(y).toBeLessThan(viewport.height - 34);
        await page.mouse.move(g.x, g.y); await page.mouse.down(); await drag(page, g, 1.42, angle);
        expect((await snapshot(page)).input.drift).toBe(true);
        await page.mouse.up();
      }
      await page.mouse.move(g.x, g.y); await page.mouse.down();
      await page.mouse.move(2, 2);
      expect((await snapshot(page)).input.distance).toBeGreaterThan(g.enter);
      await page.setViewportSize({ width: viewport.width, height: viewport.height + 40 });
      await expect.poll(async () => (await snapshot(page)).input.targetSpeed).toBe(0);
      expect((await snapshot(page)).activeId).toBeNull();
      await page.mouse.up();
      expect(await page.evaluate(() => [scrollX, scrollY, window.visualViewport!.scale])).toEqual([0, 0, 1]);
    });
    test('零死区、半速、满油门缓冲与漂移滞回反馈', async ({ page }) => {
      const g = await start(page);
      await page.mouse.move(g.x, g.y); await page.mouse.down();
      expect((await snapshot(page)).input.targetSpeed).toBe(0);
      await drag(page, g, 0.001);
      expect((await snapshot(page)).input.targetSpeed).toBeGreaterThan(0);
      await drag(page, g, 0.5);
      expect((await snapshot(page)).input.targetSpeed).toBeCloseTo(6, 1);
      await expect.poll(async () => (await snapshot(page)).state.speed, { timeout: 6000 }).toBeCloseTo(6, 1);
      await drag(page, g, 1.3);
      expect((await snapshot(page)).input).toMatchObject({ drift: false, targetSpeed: 12 });
      await expect(page.locator('#joystick-area')).toHaveAttribute('data-mode', 'full');
      await drag(page, g, 1.42);
      expect((await snapshot(page)).input).toMatchObject({ drift: true, targetSpeed: 12 });
      await drag(page, g, 1.3);
      expect((await snapshot(page)).input.drift).toBe(true);
      await expect(page.locator('#joystick-area')).toHaveAttribute('data-mode', 'drift');
      await drag(page, g, 1.1);
      expect((await snapshot(page)).input).toMatchObject({ drift: false, targetSpeed: 12 });
      await page.mouse.up();
      await expect.poll(async () => (await snapshot(page)).state.speed, { timeout: 6000 }).toBe(0);
    });
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }]) test(`取消、捕获丢失与隐藏恢复清除旧输入 ${viewport.width}×${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const g = await start(page);
  for (const name of ['pointercancel', 'lostpointercapture', 'hidden']) {
    await page.mouse.move(g.x, g.y); await page.mouse.down(); await drag(page, g, 1.45);
    const id = (await snapshot(page)).activeId!;
    if (name === 'hidden') {
      const hiddenState = await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); return window.__driving.snapshot().state; });
      await page.waitForTimeout(150);
      expect((await snapshot(page)).state).toEqual(hiddenState);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    } else {
      await page.locator('#joystick-area').dispatchEvent(name, { pointerId: id });
    }
    expect((await snapshot(page)).input).toMatchObject({ drift: false, targetSpeed: 0 });
    await drag(page, g, 1.5);
    expect((await snapshot(page)).input.targetSpeed).toBe(0);
    await page.mouse.up();
  }
});

test('真实双触点不抢占，第一触点结束不转交给第二触点', async ({ page, context }) => {
  const g = await start(page);
  const cdp = await context.newCDPSession(page);
  const one = { x: g.x, y: g.y - g.radius, id: 1 };
  const two = { x: g.x + g.radius / 2, y: g.y, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [one] });
  const first = await snapshot(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [one, two] });
  expect((await snapshot(page)).input).toEqual(first.input);
  expect((await snapshot(page)).activeId).toBe(first.activeId);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [one] });
  await expect.poll(async () => (await snapshot(page)).activeId).toBeNull();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...two, x: g.x - g.radius }] });
  expect((await snapshot(page)).input.targetSpeed).toBe(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});
