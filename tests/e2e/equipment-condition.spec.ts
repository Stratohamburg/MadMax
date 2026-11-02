import { test, expect, type Page } from "@playwright/test";

async function profile(page: Page, destroy = false): Promise<any> {
  return page.evaluate(async destroy => {
    const { ProfileRepository } = await (new Function("return import('/src/persistence/repository.ts')"))();
    const { IndexedDbStore } = await (new Function("return import('/src/persistence/store.ts')"))();
    const repository = new ProfileRepository(new IndexedDbStore());
    if (destroy) return repository.update((p: any) => {
      for (const part of Object.values(p.inventory) as any[]) {
        if (["engine-l4", "driver-seat"].includes(part.definitionId)) part.hp = 0;
        if (part.definitionId === "gearbox") part.hp = 40;
      }
      return p;
    });
    return (await repository.load()).profile;
  }, destroy);
}

async function repairRequired(page: Page) {
  for (const name of ["发动机", "驾驶座"]) {
    const item = page.locator(".inventory-part", { hasText: name });
    await item.click();
    await expect(page.locator("#selected-part")).toContainText("已毁坏，需维修");
    await page.locator("#repair-part").click();
    await expect(item).toContainText("正常");
  }
}

test("营地已装零耐久部件明确标示毁坏，付费维修关闭后恢复驾驶并持久保存", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=hub&test=1");
  await page.waitForFunction(() => (window as any).__hub);
  const before = await profile(page, true);
  await page.reload();
  await expect(page.locator("#hub-notice")).toContainText("发动机已安装但已毁坏");
  await expect(page.locator("#hub-notice")).toContainText("驾驶座已安装但已毁坏");
  await expect(page.locator("#hub-notice")).not.toContainText("缺少可用");
  await page.locator("#hub-tow").click();
  await expect(page.locator('.installed-part[data-condition="Destroyed"]')).toHaveCount(2);
  await expect(page.locator('.installed-part[data-condition="Destroyed"] .equipment-condition').first()).toHaveText("×");
  await expect(page.locator('.installed-part[data-condition="Damaged"]')).toHaveCount(1);
  await expect(page.locator('.installed-part[aria-label*="发动机"]')).toHaveAttribute("aria-label", /耐久 0\//);
  await expect(page.locator("#garage-use")).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("destroyed-equipment-390.png") });
  await repairRequired(page);
  await expect(page.locator('.installed-part[data-condition="Destroyed"]')).toHaveCount(0);
  await page.locator("#garage-close").click();
  await expect.poll(() => page.evaluate(() => (window as any).__hub.snapshot().canDrive)).toBe(true);
  const after = await profile(page);
  expect(after.currency).toBe(before.currency - 40);
  expect(after.materials.scrap).toBe(before.materials.scrap - 10);
  expect(after.blueprints).toEqual(before.blueprints);
  for (const part of Object.values(after.inventory) as any[]) {
    if (["engine-l4", "driver-seat"].includes(part.definitionId)) expect(part.hp).toBe(100);
  }
  await page.reload();
  await expect.poll(() => page.evaluate(() => (window as any).__hub?.snapshot().canDrive)).toBe(true);
});

test("准备页维修后直接关闭可出击，未保存卸下操作不会生效", async ({ page }) => {
  await page.goto("/?mode=pve&test=1");
  await expect(page.locator("#prepare")).toBeVisible();
  const before = await profile(page, true);
  await page.reload();
  await expect(page.locator("#deploy")).toBeDisabled();
  await page.locator("#garage").click();
  await repairRequired(page);
  // 布局仍为草稿；维修耐久已经单独提交。
  await page.locator(".inventory-part", { hasText: "发动机" }).click();
  await page.locator("#remove-part").click();
  await expect(page.locator("#garage-summary")).toContainText("缺少可用发动机");
  await page.locator("#garage-close").click();
  await expect(page.locator("#deploy")).toBeEnabled();
  await expect(page.locator("#prep-summary")).toContainText("可出击");
  const after = await profile(page);
  expect(after.blueprints).toEqual(before.blueprints);
  expect(after.currency).toBe(before.currency - 40);
  expect(after.materials.scrap).toBe(before.materials.scrap - 10);
  await page.reload();
  await expect(page.locator("#deploy")).toBeEnabled();
  await page.locator("#deploy").click();
  await expect(page.locator("#prepare")).not.toBeVisible();
  await expect(page.locator("#module-hud")).not.toContainText("毁坏");
});
