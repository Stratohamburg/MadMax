import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const evidence = "openspec/changes/add-vehicle-ui/evidence";
for (const width of [320, 390, 430]) test(`${width} 战斗中可见双方真实武器、弹丸和敌人`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width, height: 844 }); await page.goto("/?mode=pve&test=1");
  await page.locator("#deploy").click();
  await page.evaluate(() => {
    const pve = (window as any).__pve;
    pve.spawnEnemy("rifleman", -13, 16.5); pve.spawnEnemy("raider-pickup", -9, 16);
    pve.spawnEnemy("bunker", -11, 14.5); pve.spawnEnemy("rocketeer", -13.5, 14);
  });
  await page.waitForFunction(() => {
    const pve = (window as any).__pve, s = pve.snapshot();
    return [0, 1].every(faction => s.world.presentation.some((e: any) => e.faction === faction && e.type === "muzzle")) &&
      s.world.presentation.some((e: any) => e.type === "impact");
  });
  const result = await page.evaluate(() => {
    const pve = (window as any).__pve; pve.pause(); return { session: pve.snapshot(), combat: pve.combat() };
  });
  expect(result.session.run.phase).toBe("running");
  expect(result.combat.weapons[0].weaponId).toBe("machine-gun");
  expect(Math.abs(result.combat.weapons[0].aimAngle - result.combat.weapons[0].baseAngle)).toBeGreaterThan(.1);
  expect(result.combat.enemies.length).toBeGreaterThanOrEqual(3); expect(result.combat.effects.active).toBeGreaterThan(0);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/battle-${width}.png` });
  await writeFile(`${evidence}/battle-${width}.json`, JSON.stringify({ viewport: { width, height: 844 }, realPhone: false,
    time: result.session.world.time, weapons: result.combat.weapons, enemies: result.session.world.entities.filter(Boolean),
    eventTypes: [...new Set(result.session.world.presentation.map((e: any) => `${e.faction}:${e.type}`))], effects: result.combat.effects }, null, 2) + "\n");
  expect(errors).toEqual([]);
});

test("有限转速炮台的细线指向实际炮口，绘制只消费权威状态", async ({ page }) => {
  await page.goto("/?mode=pve");
  const result = await page.evaluate(async () => {
    const load = (url: string) => new Function(`return import('${url}')`)();
    const [{ compose, stockLoadout }, { stepWeapons, createWeaponSystem }, { createState }, { renderWeapons }, { renderMountedWeapons }] = await Promise.all([
      load("/src/loadout/index.ts"), load("/src/combat/weapons/system.ts"), load("/src/vehicle/physics/state.ts"),
      load("/src/render/weapons.ts"), load("/src/render/combat.ts")]);
    const stock = stockLoadout("sports-car"), c = compose({ ...stock, parts: [...stock.parts.filter((p: any) => p.partId !== "machine-gun"),
      { instanceId: "gun", partId: "cannon", layer: "outer", x: 0, y: 0, rotation: 0, facing: 0 }] });
    let state = createWeaponSystem(c), step: any;
    const mount = c.mounts.find((m: any) => m.weaponId), target = { id: 1, hp: 100, threat: 1, radius: .2, position: { x: mount.position.x, y: mount.position.y + 3 } };
    for (let i = 0; i < 60; i++) { step = stepWeapons(state, createState(c.profile), c, { query: () => [target] }); state = step.state; }
    const v = { ...step.visuals[0], origin: { x: 0, y: 0 }, clearCenter: { x: 0, y: 0 }, clearRadius: 1.5, range: 4, target: null };
    const before = JSON.stringify(step), canvas = document.createElement("canvas"); canvas.width = canvas.height = 400;
    const ctx = canvas.getContext("2d")!; ctx.translate(200, 200); ctx.scale(40, 40); renderWeapons(ctx, [v]);
    const data = ctx.getImageData(0, 0, 400, 400).data;
    const alphaAt = (angle: number) => {
      const x = Math.round(200 + Math.cos(angle) * 100), y = Math.round(200 + Math.sin(angle) * 100); let max = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) max = Math.max(max, data[((y + dy) * 400 + x + dx) * 4 + 3]);
      return max;
    };
    const aim = alphaAt(v.aimAngle), base = alphaAt(v.baseAngle);
    renderMountedWeapons(ctx, step.visuals);
    return { aim, base, angle: v.aimAngle - v.baseAngle, fired: step.fire.length, unchanged: before === JSON.stringify(step) };
  });
  expect(result.angle).toBeCloseTo(.45); expect(result.fired).toBe(0);
  expect(result.aim).toBeGreaterThan(result.base + 20); expect(result.unchanged).toBe(true);
});

test("九种武器与七种敌人的设计图使用实际战斗绘制", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1120 }); await page.goto("/?mode=pve");
  await expect(page.locator("#prepare")).toBeVisible();
  const result = await page.evaluate(async () => {
    document.querySelector<HTMLDialogElement>("#prepare")!.close();
    const load = (url: string) => new Function(`return import('${url}')`)();
    const [{ WEAPON_DESIGNS }, { WEAPONS }, { ENEMIES, enemySpawn }, { CombatWorld }, { renderWeaponBody, renderEnemies }] = await Promise.all([
      load("/src/combat/weapons/presentation.ts"), load("/src/combat/weapons/definitions.ts"), load("/src/combat/enemies.ts"),
      load("/src/combat/world.ts"), load("/src/render/combat.ts")]);
    const canvas = document.createElement("canvas"); canvas.id = "design-review"; canvas.width = 1200; canvas.height = 1120;
    canvas.style.cssText = "position:fixed;inset:0;z-index:99999;width:1200px;height:1120px"; document.body.append(canvas);
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#15271f"; ctx.fillRect(0, 0, 1200, 1120);
    ctx.fillStyle = "#ebd6a8"; ctx.font = 'bold 32px "Microsoft YaHei"'; ctx.fillText("MADMAX / 武器与敌人配置", 32, 52);
    ctx.font = '16px "Microsoft YaHei"'; ctx.fillStyle = "#9eb49d"; ctx.fillText("实际战斗矢量 · 枪口与炮台共用装配设计 · 俯视", 32, 82);
    let index = 0; const hashes: number[] = [];
    for (const [id, design] of Object.entries(WEAPON_DESIGNS) as [string, any][]) {
      const x = 24 + index % 3 * 392, y = 108 + Math.floor(index / 3) * 176, w = WEAPONS[id];
      ctx.fillStyle = "#25392d"; ctx.fillRect(x, y, 376, 160); ctx.strokeStyle = "#637762"; ctx.strokeRect(x, y, 376, 160);
      ctx.save(); ctx.translate(x + 80, y + 91); ctx.scale(150, 150); renderWeaponBody(ctx, id, { x: 0, y: 0 }, -Math.PI / 2, -Math.PI / 2); ctx.restore();
      ctx.fillStyle = "#f2d49d"; ctx.font = 'bold 21px "Microsoft YaHei"'; ctx.fillText(design.name, x + 145, y + 42);
      ctx.fillStyle = "#c1c8b3"; ctx.font = '14px "Microsoft YaHei"';
      ctx.fillText(`${Math.round(w.arc * 180 / Math.PI)}° / ${w.trigger === "turret" ? (w.turnRate * 180 / Math.PI).toFixed(1) + "°/s" : w.trigger === "passive" ? "事件触发" : "固定朝向"}`, x + 145, y + 72);
      ctx.fillText(`射程 ${w.range} · ${w.damage} × ${w.pellets} 伤害`, x + 145, y + 98);
      ctx.fillText(`${w.fireRate} 发/s · ${design.projectile}`, x + 145, y + 124);
      const pixels = ctx.getImageData(x + 20, y + 15, 115, 140).data; let hash = 0;
      for (const value of pixels) hash = (hash * 31 + value) >>> 0; hashes.push(hash); index++;
    }
    ctx.fillStyle = "#ebd6a8"; ctx.font = 'bold 24px "Microsoft YaHei"'; ctx.fillText("敌方 / 步兵、车辆、固定建筑", 32, 676);
    index = 0; let unchanged = true;
    for (const [id, d] of Object.entries(ENEMIES) as [string, any][]) {
      const x = 24 + index % 4 * 294, y = 700 + Math.floor(index / 4) * 196;
      ctx.fillStyle = "#25392d"; ctx.fillRect(x, y, 278, 180);
      const world = new CombatWorld(1); world.playerId = world.entities.spawn({ position: { x: 0, y: -3 }, hp: 10000, faction: 0 })!;
      world.entities.spawn(enemySpawn(id, { x: 0, y: 0 }, { theta: -Math.PI / 2 })); world.step(false);
      const before = JSON.stringify(world.snapshot()); ctx.save(); ctx.translate(x + 70, y + 92); ctx.scale(68, 68); renderEnemies(ctx, world); ctx.restore();
      unchanged &&= before === JSON.stringify(world.snapshot());
      ctx.fillStyle = "#f2d49d"; ctx.font = 'bold 16px "Microsoft YaHei"'; ctx.fillText(d.name, x + 122, y + 55);
      ctx.fillStyle = "#c1c8b3"; ctx.font = '13px "Microsoft YaHei"'; ctx.fillText(`HP ${d.hp} / 护甲 ${d.armor}`, x + 122, y + 83);
      ctx.fillText(WEAPON_DESIGNS[d.weaponId].name, x + 122, y + 109); ctx.fillText(d.kind === "building" ? "固定建筑" : `速度 ${d.speed}`, x + 122, y + 135); index++;
    }
    return { uniqueDesigns: new Set(hashes).size, enemies: index, unchanged };
  });
  expect(result).toEqual({ uniqueDesigns: 9, enemies: 7, unchanged: true });
  await mkdir(evidence, { recursive: true }); await page.locator("#design-review").screenshot({ path: `${evidence}/weapon-enemy-designs.png` });
});
