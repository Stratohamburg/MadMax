import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const evidence = "openspec/changes/add-driving-hub/evidence";
const snapshot = (page: Page): Promise<any> => page.evaluate(() => (window as any).__hub.snapshot());
async function load(page: Page) {
  await page.goto("/?mode=hub&test=1"); await page.waitForFunction(() => (window as any).__hub?.snapshot().geometry.radius > 5);
}
async function place(page: Page, x: number, y: number) { await page.evaluate(([x, y]) => (window as any).__hub.place(x, y), [x, y]); }
async function openEquipment(page: Page) { await place(page, -11, 13); await expect(page.locator("#workbench")).toBeVisible(); }

test("默认首页为驾驶营地，真实摇杆前进、松手停车进入装备区", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await expect(page).toHaveTitle("MadMax · 废土营地"); await expect(page.locator("#prepare")).toHaveCount(0);
  await expect(page.locator(".hub-directory")).toContainText("商店");
  await load(page); const initial = await snapshot(page), g = initial.geometry;
  expect(initial.position).toEqual({ x: -11, y: 19 });
  await page.mouse.move(g.x, g.y - g.radius * 0.2); await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).position.y, { timeout: 12000, intervals: [100] }).toBeLessThan(13.8);
  await page.mouse.up(); await expect(page.locator("#workbench")).toBeVisible({ timeout: 8000 });
  const parked = await snapshot(page); expect(Math.abs(parked.position.y - 13)).toBeLessThan(1.4); expect(parked.speed).toBeLessThan(0.01);
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/driving-entry.json`, JSON.stringify({ input: "Pointer Events 20% north, then release", initial: initial.position, parked: parked.position, speed: parked.speed, station: parked.parking.latched, modal: parked.modal, realPhone: false }, null, 2) + "\n");
  await page.locator("#garage-close").click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(parked.time + 1);
  await expect(page.locator("#workbench")).toHaveCount(0);
  await place(page, -11, 16); await expect.poll(async () => (await snapshot(page)).parking.latched).toBeNull();
  await openEquipment(page);
});

test("商店真实交易、模态暂停和装备保存后立即更新车辆及重载", async ({ page }) => {
  await load(page); await place(page, -15, 13); await expect(page.locator("#shop")).toBeVisible();
  const before = await snapshot(page); await expect.poll(async () => (await snapshot(page)).time, { timeout: 1000 }).toBe(before.time);
  await page.locator("#shop-definition").selectOption("inner-armor"); await page.locator("#shop-buy").click();
  await expect(page.locator("#shop-message")).toContainText("交易完成");
  const bought = await snapshot(page); expect(bought.currency).toBe(before.currency - 50); expect(bought.inventory).toBe(before.inventory + 1);
  expect(bought.time).toBe(before.time);
  await page.locator("#shop-close").click(); await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(before.time + 1);
  await expect(page.locator("#shop")).toHaveCount(0); await openEquipment(page);
  const paused = await snapshot(page);
  await page.locator(".inventory-part", { hasText: "内装甲" }).click(); await page.locator('.grid-cell[data-x="0"][data-y="0"]').click();
  await expect(page.locator("#garage-message")).toContainText("装配已更新");
  await page.locator("#blueprint-name").fill("营地装甲车"); await page.locator("#garage-use").click();
  await expect(page.locator("#workbench")).toHaveCount(0); const used = await snapshot(page);
  expect(used.mass).toBe(paused.mass + 80); expect(used.loadout.parts).toHaveLength(paused.loadout.parts.length + 1);
  used.footprint.forEach((point: { x: number; y: number }, i: number) => {
    expect(point.x).toBeCloseTo(paused.footprint[i].x, 10); expect(point.y).toBeCloseTo(paused.footprint[i].y, 10);
  }); expect(used.speed).toBe(0);
  await page.reload(); await page.waitForFunction(() => (window as any).__hub);
  expect((await snapshot(page)).mass).toBe(used.mass); expect((await snapshot(page)).loadout).toEqual(used.loadout);
});

test("关闭营地界面保留完整运动、挡位、资源和冷却，拖车不补给", async ({ page }) => {
  await load(page); await openEquipment(page);
  const result = await page.evaluate(async () => {
    const hub = (window as any).__hub, snapshot = hub.snapshot();
    const { stateFrom } = await (new Function("return import('/src/vehicle/physics/state.ts')"))();
    const state = {
      vehicle: stateFrom({ ...snapshot.vehicle, worldVelocity: { x: 0.03, y: -0.02 }, r: 0.06, delta: 0.1,
        wheelSpeeds: { front: 0.4, rear: 0.7 } }),
      drivetrain: { ...snapshot.drivetrain, gear: 2, targetGear: 3, rpm: 3000, shiftRemaining: 0.12, fuel: 4 },
      energy: 3, boost: { remaining: 0, cooldown: 1.5 }, output: { driveForce: 0, boostForce: 0 },
    };
    hub.restorePaused(state);
    const before = hub.snapshot(); (document.querySelector("#garage-close") as HTMLButtonElement).click();
    return { before, after: hub.snapshot() };
  });
  expect(result.after.vehicle).toEqual(result.before.vehicle);
  expect(result.after.drivetrain).toEqual(result.before.drivetrain);
  expect(result.after.energy).toBe(3); expect(result.after.boost).toEqual(result.before.boost);
  const tow = await page.evaluate(() => {
    const hub = (window as any).__hub, before = hub.snapshot();
    (document.querySelector("#hub-tow") as HTMLButtonElement).click();
    return { before, after: hub.snapshot() };
  });
  expect(tow.after.drivetrain.fuel).toBe(tow.before.drivetrain.fuel);
  expect(tow.after.energy).toBe(tow.before.energy); expect(tow.after.boost.cooldown).toBe(tow.before.boost.cooldown);
});

test("缺发动机车辆可拖车进入装备区购买并恢复驾驶", async ({ page }) => {
  await load(page);
  await page.evaluate(async () => {
    const { ProfileRepository } = await (new Function("return import('/src/persistence/repository.ts')"))();
    const { IndexedDbStore } = await (new Function("return import('/src/persistence/store.ts')"))();
    await new ProfileRepository(new IndexedDbStore()).update((p: any) => {
      const engine = Object.values(p.inventory).find((v: any) => v.definitionId === "engine-l4") as any;
      delete p.inventory[engine.id]; return p;
    });
  });
  await page.reload(); await expect(page.locator("#hub-tow")).toContainText("无法驾驶");
  await page.locator("#hub-tow").click(); await expect(page.locator("#workbench")).toBeVisible();
  await page.locator("#buy-definition").selectOption("engine-l4"); await page.locator("#buy-part").click();
  await expect(page.locator("#garage-message")).toContainText("已保存");
  await page.locator("#restore-stock").click(); await expect(page.locator("#garage-use")).toBeEnabled();
  await page.locator("#garage-use").click(); await expect.poll(async () => (await snapshot(page)).canDrive).toBe(true);
});

test("出击区域进入副本，取消准备和保存结算后均可返回营地", async ({ page }) => {
  await load(page); await place(page, -7, 13); await expect(page.locator("#prepare")).toBeVisible();
  await page.locator('#prepare a[href="?"]').click(); await expect(page).toHaveTitle("MadMax · 废土营地");
  await load(page); await place(page, -7, 13); await expect(page.locator("#prepare")).toBeVisible();
  await page.locator("#deploy").click(); await page.locator("#abandon").click();
  await expect(page.locator("#save-result")).toContainText("结算已保存"); await page.locator("#retry").click();
  await expect(page).toHaveTitle("MadMax · 废土营地");
  await page.locator('a[href="?mode=practice"]').click(); await expect(page).toHaveTitle("MadMax · 驾驶验证场");
  await expect(page.locator("#reset")).toBeVisible();
});

for (const width of [320, 390, 430]) test(`${width} 竖屏营地视野和装备入口`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: 844 }); await load(page); await mkdir(evidence, { recursive: true });
  const view = (await page.locator("#game-view").boundingBox())!; expect(view.height).toBeGreaterThanOrEqual(844 * 0.59);
  await page.screenshot({ path: `${evidence}/camp-${width}.png` });
  await openEquipment(page); await page.screenshot({ path: `${evidence}/equipment-${width}.png` });
  const box = (await page.locator(".grid-cell").first().boundingBox())!; expect(Math.abs(box.width - box.height)).toBeLessThan(0.1);
  expect(errors).toEqual([]);
});
