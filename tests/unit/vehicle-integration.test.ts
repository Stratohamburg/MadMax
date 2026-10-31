import { describe, expect, it } from "vitest";
import {
  createPhysicsVehicle,
  observePhysicsVehicle,
  stepPhysicsVehicle,
  getProfile,
} from "../../src/vehicle/model";
import { stepInWorld } from "../../src/scene/collision";

const profile = getProfile("sports-car");
const world = {
  bounds: { x: -100, y: -100, width: 200, height: 200 },
  obstacles: [],
};
const intent = {
  targetSpeed: profile.power.maxSpeed,
  angle: Math.PI / 4,
  drift: true,
};

describe("vehicle-physics-2 web facade", () => {
  it("无碰撞场景严格复用核心推进结果", () => {
    const start = createPhysicsVehicle({ x: -4, y: 3 }, 0, profile);
    const direct = stepPhysicsVehicle(start, intent, profile);
    const throughScene = stepInWorld(start, intent, profile, 1 / 120, world);
    expect(throughScene.position).toEqual(direct.position);
    expect(throughScene.worldVelocity).toEqual(direct.worldVelocity);
    expect(throughScene.theta).toBe(direct.theta);
    expect(throughScene.r).toBe(direct.r);
    expect(throughScene.delta).toBe(direct.delta);
    expect(throughScene.h).toBe(direct.h);
    expect(throughScene.energy).toEqual(direct.energy);
  });

  it("速度和运动方向只有核心派生，没有第二份可写权威字段", () => {
    const state = createPhysicsVehicle();
    expect(Object.getOwnPropertyDescriptor(state, "speed")?.get).toBeTypeOf(
      "function",
    );
    expect(Object.getOwnPropertyDescriptor(state, "motion")?.get).toBeTypeOf(
      "function",
    );
    expect(Object.prototype.hasOwnProperty.call(state, "x")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(state, "heading")).toBe(false);
    const observation = observePhysicsVehicle(state, profile, intent);
    expect(observation.input).toEqual(intent);
  });
});
