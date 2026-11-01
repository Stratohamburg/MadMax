import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 } });
test("准备、出击、自动搜刮和失败结算可操作", async ({ page }) => {
  // 局域网 HTTP 不提供 randomUUID，首屏与车库仍必须可用。
  await page.addInitScript(() => Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true }));
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?mode=pve&test=1");
  await expect(page.locator("#prepare")).toBeVisible();
  await expect(page.locator(".risk-rules")).toContainText("25%");
  await page.locator("#deploy").click();
  await expect(page.locator("#prepare")).not.toBeVisible();
  await page.evaluate(() => (window as any).__pve.place(-11, 14));
  await expect.poll(async () => page.evaluate(() => (window as any).__pve.snapshot().run.carry.length)).toBeGreaterThan(0);
  await page.locator("#abandon").click();
  await expect(page.locator("#settlement")).toBeVisible();
  await expect(page.locator("#settlement-title")).toHaveText("行动失败");
  expect(errors).toEqual([]);
});
