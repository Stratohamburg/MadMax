import { describe, expect, it } from "vitest";
import { mapStick } from "../../src/input/joystick";
import { applyProfile } from "../../src/vehicle/physics/config";
import { PROFILES } from "../../src/vehicle/physics/profiles";
import {
  getProfile,
  createPhysicsVehicle,
  observePhysicsVehicle,
  stepPhysicsVehicle,
} from "../../src/vehicle/model";
import { geometry } from "../../src/vehicle/physics/geometry";

describe("vehicle-physics-2 接入合同", () => {
  it("十车型都按自身Vmax映射距离，角度原样作为路线意图", () => {
    for (const profile of PROFILES) {
      const half = mapStick(25, 0, 50, false, profile);
      const full = mapStick(50, 0, 50, false, profile);
      const drift = mapStick(70, 0, 50, false, profile);
      const rear = mapStick(-25, 0, 50, false, profile);
      expect(half.targetSpeed).toBeCloseTo(profile.power.maxSpeed / 2, 12);
      expect(full.targetSpeed).toBe(profile.power.maxSpeed);
      expect(drift).toMatchObject({
        targetSpeed: profile.power.maxSpeed,
        drift: true,
      });
      expect(rear.angle).toBe(Math.PI);
      expect(rear.targetSpeed).toBeCloseTo(profile.power.maxSpeed / 2, 12);
    }
  });

  it("漂移输入档即时退出，但核心h与侧滑按自身动力学连续恢复", () => {
    const profile = getProfile("sports-car");
    let state = createPhysicsVehicle({ x: 0, y: 0 }, 0, profile);
    const drift = mapStick(70, 0, 50, false, profile);
    for (let i = 0; i < 240; i++)
      state = stepPhysicsVehicle(state, drift, profile);
    const beforeExit = state;
    const normal = mapStick(60, 0, 50, true, profile);
    expect(normal.drift).toBe(false);
    state = stepPhysicsVehicle(state, normal, profile);
    expect(state.h).toBeLessThanOrEqual(beforeExit.h);
    expect(state.h).toBeGreaterThanOrEqual(0);
    expect(Math.abs(state.r)).toBeLessThan(8);
    expect(Math.abs(state.beta)).toBeLessThan(Math.PI / 2);
  });

  it("观测直接来自核心，包含动力、阻力、轮胎和游戏代价贡献", () => {
    const profile = getProfile("rally-car");
    let state = createPhysicsVehicle({ x: 0, y: 0 }, 0, profile);
    const intent = mapStick(50, 25, 50, false, profile);
    state = stepPhysicsVehicle(state, intent, profile);
    const obs = observePhysicsVehicle(state, profile, intent);
    expect(obs.modelVersion).toBe("vehicle-physics-2");
    expect(obs.profileId).toBe("rally-car");
    expect(obs.power).toHaveProperty("resistance");
    expect(obs.front).toHaveProperty("fx");
    expect(obs.rear).toHaveProperty("fy");
    expect(obs.command).toHaveProperty("drive");
    expect(state.energy).toHaveProperty("tireDissipation");
  });

  it("拒绝旧版本和派生状态注入，合法车型应用保持完整初态工厂", () => {
    const current = getProfile("sports-car");
    const old = { ...(current as object), modelVersion: "baseline-1" };
    const rejected = applyProfile(current, old);
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.profile.profileId).toBe("sports-car");
    expect(() =>
      createPhysicsVehicle({ x: 0, y: 0 }, 0, current, { speed: 4 } as never),
    ).toThrow();
    const next = applyProfile(current, getProfile("heavy-truck"));
    expect(next.errors).toEqual([]);
    const state = createPhysicsVehicle({ x: 0, y: 0 }, 0, next.profile);
    expect(state.position).toEqual({ x: 0, y: 0 });
    expect(state.speed).toBe(0);
    expect(geometry(state, next.profile).bodyLength).toBeGreaterThan(
      geometry(createPhysicsVehicle({ x: 0, y: 0 }, 0, current), current)
        .bodyLength,
    );
  });
});
