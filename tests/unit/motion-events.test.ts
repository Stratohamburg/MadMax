import { describe, expect, it } from "vitest";
import { motionEvents } from "../../src/combat/motion-events";
import { createState } from "../../src/vehicle/physics/state";
import { getProfile } from "../../src/vehicle/physics/profiles";

describe("实际运动事件", () => {
  it("漂移策略已启用但未滑移时不触发，已有滑移无漂移策略仍触发", () => {
    const p = getProfile("sports-car");
    const requestOnly = createState(p, { h: 1, worldVelocity: { x: 3, y: 0 } });
    expect(motionEvents(requestOnly, 0, 10, 1 / 120).map(e => e.type)).toEqual(["speed"]);
    const sliding = createState(p, { worldVelocity: { x: 3, y: 1 } });
    expect(motionEvents(sliding, 0, 10, 1 / 120).map(e => e.type)).toEqual(["speed", "drift"]);
  });
  it("喷射最后一个有效步仍发事件，序号连续且不把冷却当作推力", () => {
    const p = getProfile("sports-car"), s = createState(p, { worldVelocity: { x: 3, y: 1 } });
    const result = motionEvents(s, 0.01, 5, 1 / 120);
    expect(result.map(e => e.sequence)).toEqual([5, 6, 7]); expect(result.at(-1)!.type).toBe("boost");
    expect(motionEvents(s, 0, 8, 1 / 120).some(e => e.type === "boost")).toBe(false);
  });
});
