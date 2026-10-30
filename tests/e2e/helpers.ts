import type { Page } from '@playwright/test';
import type { VehicleState } from '../../src/vehicle/model';
import type { VehicleConfig } from '../../src/vehicle/config';
import type { StickSample, StickGeometry } from '../../src/input/joystick';

export interface Snapshot {
  state: VehicleState; input: StickSample; geometry: StickGeometry; activeId: number | null;
  config: VehicleConfig; time: number; camera: { x: number; y: number; rotation: number }; trails: number;
}
declare global { interface Window { __driving: { snapshot(): Snapshot; test?: { place(state: Partial<VehicleState>): void } } } }
export async function snapshot(page: Page): Promise<Snapshot> { return page.evaluate(() => window.__driving.snapshot()); }
export async function start(page: Page): Promise<StickGeometry> {
  await page.goto('/');
  await page.waitForFunction(() => window.__driving?.snapshot().geometry.radius > 5);
  return (await snapshot(page)).geometry;
}
export async function drag(page: Page, geometry: StickGeometry, ratio: number, angle = -Math.PI / 2): Promise<void> {
  await page.mouse.move(geometry.x + Math.cos(angle) * geometry.radius * ratio,
    geometry.y + Math.sin(angle) * geometry.radius * ratio);
}
