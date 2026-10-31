import { test, expect } from "@playwright/test";
import { start, snapshot } from "./helpers";
import { mkdir, writeFile } from "node:fs/promises";

test("验证模式可切换十车型并从一致出生状态重置", async ({ page }) => {
  await page.goto("/?validate=1");
  await page.waitForFunction(
    () =>
      window.__driving?.snapshot().version?.modelVersion ===
      "vehicle-physics-2",
  );
  await expect(page.locator("#validation-panel")).toBeVisible();
  await page.locator("#validation-panel summary").click();
  const ids = [
    "light-pickup",
    "heavy-pickup",
    "van",
    "box-truck",
    "truck",
    "heavy-truck",
    "sports-car",
    "rally-car",
    "muscle-car",
    "off-road",
  ];
  for (const id of ids) {
    await page.locator('select[name="profileId"]').selectOption(id);
    await page.getByRole("button", { name: "应用并重置" }).click();
    await expect(page.locator("#parameter-message")).toHaveAttribute(
      "data-error",
      "false",
    );
    const current = await snapshot(page);
    expect(current.config.profileId).toBe(id);
    expect(current.state.speed).toBe(0);
    expect(current.state.x).toBe(-11);
    expect(current.state.y).toBe(19);
    const directory = `openspec/changes/validate-driving-prototype/evidence/vehicle-physics-2/${id}/2`;
    await mkdir(directory, { recursive: true });
    await writeFile(
      `${directory}/snapshot.json`,
      JSON.stringify(
        {
          profileId: id,
          profileRevision: current.version?.profileRevision ?? "2",
          modelVersion: current.version?.modelVersion ?? "vehicle-physics-2",
          surfaceVersion:
            current.version?.surfaceVersion ?? "vehicle-surface-1",
          sceneVersion: current.version?.sceneVersion ?? "driving-playground-3",
          state: current.state,
        },
        null,
        2,
      ) + "\n",
    );
    await page.screenshot({ path: `${directory}/browser.png` });
  }
  await expect(page.locator("#telemetry")).toContainText(
    "前轴 α / Fy / 利用率",
  );
  await expect(page.locator("#telemetry")).toContainText("vehicle-physics-2");
});

test("普通页面保持简洁，场景版本和三路面采样写入开发快照", async ({ page }) => {
  const g = await start(page);
  const current = await snapshot(page);
  expect(
    (
      current as typeof current & {
        version: { sceneVersion: string; surfaceVersion: string };
      }
    ).version.sceneVersion,
  ).toBe("driving-playground-3");
  expect(
    (
      current as typeof current & {
        version: { sceneVersion: string; surfaceVersion: string };
      }
    ).version.surfaceVersion,
  ).toBe("vehicle-surface-1");
  await expect(page.locator("#validation-panel")).toBeHidden();
  expect(g.radius).toBeGreaterThan(5);
});
