import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const evidence = "openspec/changes/add-vehicle-ui/evidence";
test("工作台编辑、非法摆放、朝向、方案保存及真实 IndexedDB 重载", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=pve&test=1"); await page.locator("#garage").click();
  await expect(page.locator("#workbench")).toBeVisible();
  await page.locator(".inventory-part", { hasText: "发动机" }).click();
  await page.locator("#remove-part").click();
  await expect(page.locator("#garage-summary")).toContainText("缺少可用发动机");
  await expect(page.locator("#garage-use")).toBeDisabled();
  await page.locator("#restore-stock").click(); await expect(page.locator("#garage-use")).toBeEnabled();
  await page.locator(".inventory-part", { hasText: "发动机" }).click();
  await page.locator('.installed-part[aria-label*="驾驶"]').click();
  await expect(page.locator("#garage-message")).toContainText("重叠");
  await page.locator(".inventory-part", { hasText: "机枪" }).click();
  await expect(page.locator('[data-layer="outer"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator("#face-part").click(); await expect(page.locator("#selected-part")).toContainText("45°");
  await page.locator("#blueprint-name").fill("北上搜刮车"); await page.locator("#blueprint-save").click();
  await expect(page.locator("#garage-message")).toContainText("已保存");
  await page.locator("#garage-use").click(); await expect(page.locator("#workbench")).toHaveCount(0);
  await page.reload(); await page.locator("#garage").click();
  await expect(page.locator("#blueprint-select")).toContainText("北上搜刮车");
  await page.locator(".inventory-part", { hasText: "机枪" }).click(); await expect(page.locator("#selected-part")).toContainText("45°");
});
test("Pointer Events 拖拽非法落点保持原布局", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto("/?mode=pve"); await page.locator("#garage").click();
  const cells = page.locator(".installed-part"); const from = cells.filter({ has: page.locator('svg') }).filter({ hasText: "发动机" }), to = cells.filter({ hasText: "油箱" });
  const before = await cells.count(), a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2); await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 }); await page.mouse.up();
  await expect(page.locator("#garage-message")).toContainText("重叠"); expect(await cells.count()).toBe(before);
});
test("多格装备任意格抓取后整体移动，变速箱旋转为横向完整外形", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto("/?mode=pve"); await page.locator("#garage").click();
  const engine = page.locator('.installed-part[aria-label*="发动机"]'), from = (await engine.boundingBox())!;
  const target = (await page.locator('.grid-cell[data-x="0"][data-y="1"]').boundingBox())!;
  await page.mouse.move(from.x + from.width * 0.75, from.y + from.height * 0.75); await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(page.locator("#garage-message")).toContainText("装配已更新");
  await expect(page.locator("#selected-part")).toContainText("发动机");
  const moved = (await engine.boundingBox())!; expect(moved.y).toBeLessThan(from.y - target.height);
  // 从右下格抓取后落在右下格，部件锚点不跳到指针位置。
  expect(moved.x + moved.width).toBeCloseTo(target.x + target.width, 0);
  expect(moved.y + moved.height).toBeCloseTo(target.y + target.height, 0);
  await page.locator("#restore-stock").click();
  await page.locator(".inventory-part", { hasText: "变速箱" }).click(); await page.locator('.grid-cell[data-x="0"][data-y="-1"]').click();
  await expect(page.locator("#garage-message")).toContainText("装配已更新");
  const gearbox = page.locator('.installed-part[aria-label*="变速箱"]'), before = (await gearbox.boundingBox())!;
  await page.locator("#rotate-part").click(); await expect(page.locator("#selected-part")).toContainText("旋转 90°");
  const after = (await gearbox.boundingBox())!; expect(after.width).toBeCloseTo(before.height, 0); expect(after.height).toBeCloseTo(before.width, 0);
  await expect(gearbox.locator(".equipment-art")).toHaveCount(1); await expect(gearbox.locator(".equipment-outline")).toHaveCount(1);
});
test("结算写入失败可重试，成功之前禁止开始下一局，重载不会重复发奖", async ({ page }) => {
  await page.goto("/?mode=pve&test=1"); await page.locator("#deploy").click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let injected = false;
    IDBObjectStore.prototype.put = function(value, key) {
      if (!injected && value?.pending) { injected = true; throw new DOMException("测试写入中断", "UnknownError"); }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await page.locator("#abandon").click(); await expect(page.locator("#save-retry")).toBeVisible();
  await expect(page.locator("#retry")).toBeDisabled(); await page.locator("#save-retry").click();
  await expect(page.locator("#save-result")).toContainText("结算已保存"); await expect(page.locator("#retry")).toBeEnabled();
  await page.reload();
  const stats = await page.evaluate(async () => {
    const { ProfileRepository } = await (new Function("return import('/src/persistence/repository.ts')"))();
    const { IndexedDbStore } = await (new Function("return import('/src/persistence/store.ts')"))();
    return (await new ProfileRepository(new IndexedDbStore()).load()).profile.stats;
  }); expect(stats.runs).toBe(1);
});
test("丢失库存后还原预设明示缺失且不补造", async ({ page }) => {
  await page.goto("/?mode=pve"); await expect(page.locator("#prepare")).toBeVisible();
  await page.evaluate(async () => {
    const { ProfileRepository } = await (new Function("return import('/src/persistence/repository.ts')"))();
    const { IndexedDbStore } = await (new Function("return import('/src/persistence/store.ts')"))();
    await new ProfileRepository(new IndexedDbStore()).update((p: any) => {
      const engine = Object.values(p.inventory).find((part: any) => part.definitionId === "engine-l4") as any;
      delete p.inventory[engine.id]; return p;
    });
  });
  await page.reload(); await page.locator("#garage").click(); await page.locator("#restore-stock").click();
  await expect(page.locator("#garage-message")).toContainText("缺少：L4 发动机");
  await expect(page.locator("#garage-use")).toBeDisabled(); await expect(page.locator(".inventory-part")).toHaveCount(6);
});
for (const width of [320, 390, 430]) test(`${width} 竖屏工作台与战斗布局`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width, height: 844 }); await page.goto("/?mode=pve&test=1");
  await page.locator("#garage").click(); await mkdir(evidence, { recursive: true });
  await expect(page.locator('.vehicle-blueprint[aria-label*="底盘俯视图"]')).toBeVisible();
  const boxes = await page.locator(".grid-cell").evaluateAll(elements => elements.map(e => { const r = e.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
  expect(boxes.length).toBeGreaterThan(10); for (const box of boxes) expect(Math.abs(box.width - box.height)).toBeLessThan(0.1);
  await writeFile(`${evidence}/grid-${width}.json`, JSON.stringify({ viewport: { width, height: 844 }, layer: "inner", cellCount: boxes.length, cell: boxes[0], maxSquareError: Math.max(...boxes.map(b => Math.abs(b.width - b.height))), realPhone: false }, null, 2) + "\n");
  const engine = page.locator('.installed-part[aria-label*="发动机"]');
  await expect(engine).toHaveCount(1); await expect(engine.locator(".equipment-outline")).toHaveCount(1);
  expect((await engine.boundingBox())!.width).toBeGreaterThan(boxes[0].width * 1.9);
  await page.screenshot({ path: `${evidence}/garage-${width}.png` });
  await page.locator('[data-layer="outer"]').click();
  await expect(page.locator('.vehicle-blueprint[aria-label*="外观俯视图"]')).toBeVisible();
  const outerCell = (await page.locator(".grid-cell").first().boundingBox())!; expect(Math.abs(outerCell.width - outerCell.height)).toBeLessThan(0.1);
  await page.screenshot({ path: `${evidence}/exterior-${width}.png` });
  const layout = await page.locator("#workbench").evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
  await page.locator("#garage-close").click(); await page.locator("#deploy").click();
  await expect(page.locator("#module-hud")).toContainText("所有模块正常");
  expect((await page.locator("#game-view").boundingBox())!.height).toBeGreaterThanOrEqual(844 * 0.59);
  await page.screenshot({ path: `${evidence}/combat-${width}.png` }); expect(errors).toEqual([]);
});
test("射界像素在净空圆内完全透明，绘制不修改武器状态", async ({ page }) => {
  await page.goto("/?mode=pve");
  const result = await page.evaluate(async () => {
    const { renderWeapons } = await (new Function("return import('/src/render/weapons.ts')"))();
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 200; const ctx = canvas.getContext("2d")!;
    ctx.translate(100, 100); ctx.scale(20, 20);
    const visuals = [{ instanceId: "test", origin: { x: 0.2, y: 0 }, baseAngle: 0, aimAngle: 0, arc: Math.PI * 2, range: 4,
      clearCenter: { x: 0, y: 0 }, clearRadius: 1.5, rimProgress: 1, heatProgress: 0.8, overheated: true, lockProgress: 1, target: { x: 0.5, y: 0 } }];
    const before = JSON.stringify(visuals); renderWeapons(ctx, visuals);
    const pixels = ctx.getImageData(0, 0, 200, 200).data; let inside = 0, outside = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (pixels[(y * 200 + x) * 4 + 3]) {
      if (Math.hypot(x - 99.5, y - 99.5) < 29) inside++; else outside++;
    }
    return { inside, outside, unchanged: before === JSON.stringify(visuals) };
  });
  expect(result.inside).toBe(0); expect(result.outside).toBeGreaterThan(100); expect(result.unchanged).toBe(true);
});
