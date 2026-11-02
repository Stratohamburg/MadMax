import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const evidence = "openspec/changes/add-gm-tools/evidence";
const snapshot = (page: Page): Promise<any> => page.evaluate(() => (window as any).__hub.snapshot());
async function load(page: Page) {
  await page.goto("/?mode=hub&test=1"); await page.waitForFunction(() => (window as any).__hub);
}
async function profile(page: Page, damage = false): Promise<any> {
  return page.evaluate(async damage => {
    const { ProfileRepository } = await (new Function("return import('/src/persistence/repository.ts')"))();
    const { IndexedDbStore } = await (new Function("return import('/src/persistence/store.ts')"))();
    const repo = new ProfileRepository(new IndexedDbStore());
    return damage ? repo.update((p: any) => { for (const part of Object.values(p.inventory) as any[]) part.hp = 0; return p; }) : (await repo.load()).profile;
  }, damage);
}

test("GM 发物资保存准确，非法输入不改档，打开暂停且关闭清除输入", async ({ page }) => {
  await load(page); const before = await profile(page);
  const geometry = (await snapshot(page)).geometry;
  await page.mouse.move(geometry.x, geometry.y - geometry.radius * .2); await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).speed).toBeGreaterThan(.1);
  // 保持摇杆输入时以键盘激活 GM，验证主动清除输入。
  await page.locator("#hub-gm").focus(); await page.keyboard.press("Enter"); await page.mouse.up();
  await expect(page.locator("#gm-panel")).toBeVisible(); const paused = await snapshot(page);
  await page.locator("#gm-resource-amount").fill("1000"); await page.locator("#gm-grant-currency").click();
  await expect(page.locator("#gm-message")).toContainText("已发放 1000 货币");
  await page.locator("#gm-resource-amount").fill("500"); await page.locator("#gm-grant-scrap").click();
  await expect(page.locator("#gm-message")).toContainText("已发放 500 废料");
  await page.locator("#gm-part").selectOption("cannon"); await page.locator("#gm-part-amount").fill("3");
  await page.locator("#gm-grant-parts").click(); await expect(page.locator("#gm-message")).toContainText("已发放 3 件");
  const after = await profile(page);
  expect(after.currency).toBe(before.currency + 1000); expect(after.materials.scrap).toBe(before.materials.scrap + 500);
  expect(Object.values(after.inventory).filter((p: any) => p.definitionId === "cannon")).toHaveLength(3);
  expect(after.blueprints).toEqual(before.blueprints);
  for (const amount of ["0", "-1", "1.5", "1000001"]) {
    await page.locator("#gm-resource-amount").fill(amount); await page.locator("#gm-grant-currency").click();
    await expect(page.locator("#gm-message")).toContainText("数量须为"); expect(await profile(page)).toEqual(after);
  }
  const stillPaused = await snapshot(page); expect(stillPaused.time).toBe(paused.time); expect(stillPaused.position).toEqual(paused.position);
  expect(stillPaused.input.targetSpeed).toBe(0);
  await page.locator("#gm-close").click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(paused.time);
  expect((await snapshot(page)).input.targetSpeed).toBe(0);
  await page.reload(); await page.waitForFunction(() => (window as any).__hub);
  expect(await profile(page)).toEqual(after);
});

test("GM 免费修复零耐久车辆，关闭后恢复驾驶及机枪且重载保留", async ({ page }) => {
  await load(page); const before = await profile(page, true); await page.reload();
  await page.waitForFunction(() => (window as any).__hub);
  await expect.poll(async () => (await snapshot(page)).canDrive).toBe(false);
  await page.locator("#hub-gm").click(); await page.locator("#gm-repair-all").click();
  await expect(page.locator("#gm-message")).toContainText("全部装备已恢复满耐久");
  const after = await profile(page);
  for (const part of Object.values(after.inventory) as any[]) expect(part.hp).toBeGreaterThan(0);
  expect(after.currency).toBe(before.currency); expect(after.materials).toEqual(before.materials); expect(after.blueprints).toEqual(before.blueprints);
  await page.locator("#gm-close").click(); await expect.poll(async () => (await snapshot(page)).canDrive).toBe(true);
  await page.reload(); await page.waitForFunction(() => (window as any).__hub); expect(await profile(page)).toEqual(after);
});

test("GM 重置须确认，保存失败保留旧档和 pending，重试后恢复完整初始车辆", async ({ page }) => {
  await load(page); const initial = await profile(page);
  await page.locator("#hub-gm").click(); await page.locator("#gm-grant-currency").click();
  await expect(page.locator("#gm-message")).toContainText("已发放");
  await expect(page.locator("#gm-reset")).toBeDisabled();
  // 在已打开的 GM 中模拟待处理结算及一次写入失败。
  const before = await page.evaluate(async () => {
    const load = (path: string) => new Function(`return import('${path}')`)();
    const [{ ProfileRepository }, { IndexedDbStore }, { PveSession }, { newProfile }] = await Promise.all([
      load("/src/persistence/repository.ts"), load("/src/persistence/store.ts"), load("/src/modes/pve/session.ts"), load("/src/persistence/profile.ts")]);
    const store = new IndexedDbStore(), repo = new ProfileRepository(store);
    const session = new PveSession("pending-gm-test", 5, newProfile().blueprints[0].loadout);
    session.start(); session.finish("extracted"); await repo.stage(session.run.settlement);
    const original = ProfileRepository.prototype.reset; let fail = true;
    ProfileRepository.prototype.reset = function () { if (fail) { fail = false; return Promise.reject(new Error("模拟写入失败")); } return original.call(this); };
    return store.transaction((records: any) => ({ records, value: structuredClone(records) }));
  });
  await page.locator("#gm-reset-confirm").check(); await page.locator("#gm-reset").click();
  await expect(page.locator("#gm-message")).toContainText("模拟写入失败");
  const retained = await page.evaluate(async () => {
    const { IndexedDbStore } = await (new Function("return import('/src/persistence/store.ts')"))();
    return new IndexedDbStore().transaction((records: any) => ({ records, value: structuredClone(records) }));
  });
  expect(retained).toEqual(before);
  await page.locator("#gm-reset").click(); await page.waitForURL(url => url.search === "");
  await expect(page.locator("#gm-panel")).toHaveCount(0); await load(page);
  expect(await profile(page)).toEqual(initial);
  expect((await snapshot(page)).canDrive).toBe(true);
  await page.reload(); await page.waitForFunction(() => (window as any).__hub); expect(await profile(page)).toEqual(initial);
  await page.goto("/?mode=pve&test=1"); await expect(page.locator("#deploy")).toBeEnabled();
  await page.locator("#deploy").click();
  await page.evaluate(() => (window as any).__pve.spawnEnemy("bunker", -11, 14.5));
  await page.waitForFunction(() => (window as any).__pve.snapshot().world.presentation.some((e: any) => e.faction === 0 && e.type === "muzzle" && e.weaponId === "machine-gun"));
});

for (const width of [320, 390, 430]) test(`${width} 竖屏 GM 与默认车顶机枪可见`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  // 记录实际 Canvas 武器本体绘制，验证营地真正消费机枪设计。
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function (...args: any[]) {
      if (this.fillStyle === "#82988c") (window as any).__machineGunDraws = ((window as any).__machineGunDraws ?? 0) + 1;
      return (fill as any).apply(this, args);
    };
  });
  await page.setViewportSize({ width, height: 844 }); await load(page);
  await page.waitForFunction(() => (window as any).__machineGunDraws > 0);
  const p = await profile(page), gun = p.blueprints[0].loadout.parts.filter((p: any) => p.partId === "machine-gun");
  expect(gun).toHaveLength(1); expect(gun[0]).toMatchObject({ x: 0, y: 0 });
  await mkdir(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/default-car-${width}.png` });
  await page.locator("#hub-gm").click(); await expect(page.locator("#gm-panel")).toBeVisible();
  const layout = await page.locator("#gm-panel").evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
  await page.screenshot({ path: `${evidence}/gm-${width}.png` });
  await page.locator("#gm-reset-confirm").check(); await expect(page.locator("#gm-reset")).toBeEnabled();
  expect(errors).toEqual([]);
});
