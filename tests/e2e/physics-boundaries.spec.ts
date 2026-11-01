import { test, expect } from "@playwright/test";

test("旧档案的支持域外装配明确拒绝并可在工作台修复", async ({ page }) => {
  await page.goto("/?mode=hub&test=1"); await page.waitForFunction(() => (window as any).__hub);
  await page.evaluate(async () => {
    const load = (path: string) => new Function(`return import('${path}')`)();
    const { ProfileRepository } = await load("/src/persistence/repository.ts");
    const { IndexedDbStore } = await load("/src/persistence/store.ts");
    const { CATALOG, placePart } = await load("/src/loadout/model.ts");
    await new ProfileRepository(new IndexedDbStore()).update((profile: any) => {
      const blueprint = profile.blueprints.find((b: any) => b.id === "active") ?? profile.blueprints[0]; let n = 0;
      for (const cell of [...CATALOG.chassis[blueprint.loadout.chassisId].layers.outer].sort((a: any, b: any) => b.x - a.x || Math.abs(a.y) - Math.abs(b.y))) {
        const id = `legacy-cannon:${n}`;
        const result = placePart(blueprint.loadout, { instanceId: id, partId: "cannon", layer: "outer", x: cell.x, y: cell.y, rotation: 0, facing: 0 });
        if (!result.ok) continue;
        blueprint.loadout = result.value; profile.inventory[id] = { id, definitionId: "cannon", level: 1, xp: 0, hp: CATALOG.parts.cannon.hp };
        if (++n === 8) break;
      }
      return profile;
    });
  });
  await page.reload(); await expect(page.locator(".save-error")).toContainText("cgFromRear");
  await page.getByRole("button", { name: "打开装配工作台" }).click();
  await expect(page.locator("#garage-summary")).toContainText("支持范围"); await expect(page.locator("#garage-use")).toBeDisabled();
  await page.locator("#restore-stock").click(); await expect(page.locator("#garage-use")).toBeEnabled();
  await page.locator("#garage-use").click(); await page.waitForFunction(() => (window as any).__hub?.snapshot().canDrive);
  const stored = await page.evaluate(() => (window as any).__hub.snapshot());
  expect(stored.loadout.parts.some((p: any) => p.instanceId.startsWith("legacy-cannon:"))).toBe(false);
  expect(stored.inventory).toBeGreaterThanOrEqual(15);
});
