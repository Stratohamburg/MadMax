import { test, expect } from "@playwright/test";
import { start, snapshot, drag } from "./helpers";
import { mkdir } from "node:fs/promises";

const evidence =
  "openspec/changes/validate-driving-prototype/evidence/vehicle-physics-2/sports-car/2/browser-regression";
for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test.describe(`驾驶回归 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    test("行驶、侧滑、重置、旧触点不接管和重新起步", async ({ page }) => {
      const g = await start(page);
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      await drag(page, g, 1.1);
      await expect
        .poll(async () => (await snapshot(page)).state.speed)
        .toBeGreaterThan(4);
      const before = await snapshot(page);
      await drag(page, g, 1.45, 0);
      await expect
        .poll(async () => Math.abs((await snapshot(page)).state.beta))
        .toBeGreaterThan(0.05);
      await expect
        .poll(async () => (await snapshot(page)).trails)
        .toBeGreaterThan(0);
      const during = await snapshot(page);
      expect(
        Math.abs(during.state.heading - during.state.motion),
      ).toBeGreaterThan(0.05);
      expect(during.camera.rotation).toBe(0);
      expect(during.state.y).toBeLessThan(before.state.y);
      await mkdir(evidence, { recursive: true });
      await page.screenshot({
        path: `${evidence}/${viewport.width}x${viewport.height}.png`,
      });
      // 在旧触点仍按下时由第二操作触发真实重置按钮。
      await page.locator("#reset").dispatchEvent("click");
      let reset = await snapshot(page);
      expect(reset.state).toMatchObject({
        x: -11,
        y: 19,
        speed: 0,
        heading: -Math.PI / 2,
        motion: -Math.PI / 2,
        turnSign: 0,
      });
      expect(reset.trails).toBe(0);
      expect(reset.input.targetSpeed).toBe(0);
      expect(reset.activeId).toBeNull();
      expect(reset.camera.rotation).toBe(0);
      await drag(page, g, 1.4);
      await page.waitForTimeout(100);
      reset = await snapshot(page);
      expect(reset.state.speed).toBe(0);
      expect(reset.state.x).toBe(-11);
      expect(reset.state.y).toBe(19);
      await page.mouse.up();
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      await drag(page, g, 0.5);
      await expect
        .poll(async () => (await snapshot(page)).state.speed)
        .toBeGreaterThan(0);
      await page.mouse.up();
    });
    test("高速撞击与普通模式已有横摆均由物理保留，不按输入清零", async ({
      page,
    }) => {
      await page.clock.install();
      await page.goto("/?test=1");
      await page.waitForFunction(() => !!window.__driving?.test);
      await page.evaluate(() =>
        window.__driving.test!.place({ x: -4, y: 12, heading: 0, speed: 12 }),
      );
      await page.clock.runFor(100);
      const hit = await snapshot(page);
      expect(hit.state.x).toBeLessThanOrEqual(-3.59);
      expect(hit.state.energy.collisionDissipation).toBeGreaterThan(0);
      expect(Number.isFinite(hit.state.r)).toBe(true);
      await page.evaluate(() =>
        window.__driving.test!.place({
          x: 5,
          y: 0,
          theta: 0,
          worldVelocity: { x: 0.1, y: 8 },
          r: -3,
        }),
      );
      await page.clock.runFor(25);
      const unstable = await snapshot(page);
      expect(unstable.input.drift).toBe(false);
      expect(Math.abs(unstable.state.r)).toBeGreaterThan(2);
      expect(Math.abs(unstable.state.beta)).toBeGreaterThan(Math.PI * 0.4);
      expect(unstable.state.energy.tireDissipation).toBeGreaterThan(0);
    });
  });
}

test("各练习区域可驾驶且固定镜头保持方向", async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?test=1");
  await page.waitForFunction(() => !!window.__driving?.test);
  const regions = [
    {
      name: "straight",
      x: -11,
      y: 18,
      heading: -Math.PI / 2,
      angle: -Math.PI / 2,
      drift: false,
    },
    { name: "gentle", x: -9, y: -22, heading: -0.8, angle: -0.2, drift: false },
    { name: "hairpin", x: 18, y: -26, heading: 0.5, angle: 1.8, drift: true },
    { name: "slalom", x: 13, y: -7, heading: 0.5, angle: 2.1, drift: true },
    {
      name: "open",
      x: 7,
      y: 12,
      heading: Math.PI / 2,
      angle: Math.PI / 2,
      drift: false,
    },
  ];
  for (const region of regions) {
    await page.evaluate(
      (region) =>
        window.__driving.test!.place({
          x: region.x,
          y: region.y,
          heading: region.heading,
          motion: region.heading,
          speed: 6,
        }),
      region,
    );
    const g = (await snapshot(page)).geometry;
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await drag(page, g, region.drift ? 1.45 : 0.65, region.angle);
    await page.waitForTimeout(650);
    const after = await snapshot(page);
    expect(
      Math.hypot(after.state.x - region.x, after.state.y - region.y),
    ).toBeGreaterThan(1);
    expect(after.camera.rotation).toBe(0);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/region-${region.name}.png` });
    await page.mouse.up();
  }
});

test("验证模式真实观测、非法参数保留旧配置、合法应用重置与恢复默认", async ({
  page,
}) => {
  const g = await start(page);
  await expect(page.locator("#validation-panel")).toBeHidden();
  await page.locator("#validate-toggle").click();
  await expect(page.locator("#validation-panel")).toBeVisible();
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await drag(page, g, 1.1);
  await expect
    .poll(async () => (await snapshot(page)).state.speed)
    .toBeGreaterThan(4);
  await drag(page, g, 1.45, 0);
  await expect
    .poll(async () => (await snapshot(page)).state.energy.tireDissipation)
    .toBeGreaterThan(0);
  await expect(page.locator("#telemetry")).toContainText("轮胎 / 制动耗散");
  await expect(page.locator("#telemetry")).toContainText("漂移输入  开启");
  const during = await snapshot(page);
  await drag(page, g, 1.1, during.state.heading);
  await expect
    .poll(async () => (await snapshot(page)).state.observation.drift)
    .toBe(false);
  expect(
    Math.abs((await snapshot(page)).state.motion - during.state.motion),
  ).toBeLessThan(0.4);
  await page.mouse.up();
  await page.locator("#validation-panel summary").click();
  await page
    .getByRole("spinbutton", { name: "最高目标速度", exact: true })
    .fill("0");
  await page.getByRole("button", { name: "应用并重置" }).click();
  await expect(page.locator("#parameter-message")).toHaveAttribute(
    "data-error",
    "true",
  );
  expect((await snapshot(page)).config.maxSpeed).toBe(12);
  await page
    .getByRole("spinbutton", { name: "最高目标速度", exact: true })
    .fill("16");
  await page.getByRole("button", { name: "应用并重置" }).click();
  await expect(page.locator("#parameter-message")).toHaveAttribute(
    "data-error",
    "false",
  );
  expect((await snapshot(page)).config.maxSpeed).toBe(16);
  expect((await snapshot(page)).state).toMatchObject({
    x: -11,
    y: 19,
    speed: 0,
  });
  await page.getByRole("button", { name: "恢复默认" }).click();
  expect((await snapshot(page)).config.maxSpeed).toBe(12);
  expect((await snapshot(page)).state.speed).toBe(0);
  await page.goto("/?validate=1");
  await expect(page.locator("#validation-panel")).toBeVisible();
});
