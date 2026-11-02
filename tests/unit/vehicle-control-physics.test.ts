import { describe, expect, it } from "vitest";
import { getProfile } from "../../src/vehicle/physics/profiles";
import { createState } from "../../src/vehicle/physics/state";
import { controlVehicle } from "../../src/vehicle/control/driver";
import { applyImpulseEvents } from "../../src/vehicle/physics/forces";
import { massProperties } from "../../src/vehicle/physics/mass-properties";
import { consumePower, powerBudget } from "../../src/vehicle/physics/supply";
import { advanceEnemyVehicle } from "../../src/combat/enemy-vehicles";
import { ENEMIES } from "../../src/combat/enemies";

describe("车辆控制与物理职责边界", () => {
  it("相同意图不依赖输入来源，控制器只产生有限执行器请求", () => {
    const p = getProfile("sports-car"), s = createState(p, { worldVelocity: { x: 3, y: 0 } });
    const a = controlVehicle(s, { targetSpeed: 8, angle: 0.4, drift: false }, p);
    const b = controlVehicle(s, { targetSpeed: 8, angle: 0.4, drift: false }, p);
    expect(a.command).toEqual(b.command);
    expect(Math.abs(a.command.steeringTarget)).toBeLessThanOrEqual(p.steering.maxAngle);
    expect(a.command.drive).toBeGreaterThanOrEqual(0); expect(a.command.drive).toBeLessThanOrEqual(1);
  });

  it("外部冲量按来源和序号去重，偏心点仍产生横摆", () => {
    const p = getProfile("sports-car"), s = createState(p), event = { tick: 0, source: "cannon:1", sequence: 4,
      impulse: { x: -1, y: 0 }, point: { x: 0, y: 0.2 }, frame: "world" as const };
    const once = applyImpulseEvents(s, p, { lastSequence: {} }, 0, [event]);
    const twice = applyImpulseEvents(once.state, p, once.history, 0, [event]);
    expect(once.state.r).not.toBe(0); expect(twice.state).toEqual(once.state);
  });

  it("装备质量属性同时计算三维重心和二维平行轴惯量", () => {
    const result = massProperties([{ mass: 1, x: 0, y: 0, z: 0.1, inertia: 0.2 }, { mass: 1, x: 1, y: 0, z: 0.5, inertia: 0 }]);
    expect(result.center.x).toBe(0.5); expect(result.center.z).toBe(0.3); expect(result.inertia).toBeCloseTo(0.7);
  });

  it("共享电力预算不会超过剩余电量和瞬时输出", () => {
    const first = consumePower(powerBudget(1, 10, 0.1), 2);
    expect(first.granted).toBe(1); expect(first.budget.energy).toBe(0); expect(first.budget.consumed).toBe(1);
  });

  it("敌方车辆由 AI 意图驱动同一车辆物理状态", () => {
    const definition = ENEMIES["raider-pickup"];
    const next = advanceEnemyVehicle(undefined, definition, { x: 0, y: 0 }, { x: 0, y: 0 }, 0, { x: 5, y: 0 });
    expect(next.vehicle.position.x).toBeGreaterThan(0); expect(Number.isFinite(next.vehicle.r)).toBe(true);
  });
});
