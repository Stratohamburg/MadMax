import { describe, it, expect } from "vitest";
import {
  getProfile,
  createState,
  step,
  createVehicleSnapshot,
  restoreVehicleSnapshot,
} from "../../src/vehicle/model";
import { SURFACES } from "../../src/vehicle/physics/surfaces";
describe("vehicle-snapshot-2完整续算", () => {
  it("同ID自定义有效参数、时间、轮速、能量和控制历史经过JSON后精确续算", () => {
    const p = getProfile("rally-car");
    p.power.driveForce *= 0.8;
    p.tires.rear.muY *= 0.7;
    let s = createState(p, { worldVelocity: { x: 5, y: 1 }, r: 0.5, time: 4 });
    const surface = (_point: unknown, _axle: unknown, t: number) =>
      t < 5 ? SURFACES.hard : SURFACES.wet;
    const input = { targetSpeed: 7, angle: 1.5, drift: true };
    for (let i = 0; i < 90; i++) s = step(s, input, p, 1 / 120, { surface });
    const snapshot = createVehicleSnapshot(s, p, "driving-playground-3", "wet"),
      restored = restoreVehicleSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.profile).toEqual(p);
    expect(restored.state).toEqual(s);
    let a = s,
      b = restored.state;
    for (let i = 0; i < 180; i++) {
      a = step(a, input, p, 1 / 120, { surface });
      b = step(b, input, restored.profile, 1 / 120, { surface });
    }
    expect(a).toEqual(b);
    expect(() =>
      restoreVehicleSnapshot({
        ...snapshot,
        initial: { ...snapshot.initial, assist: { driftBlend: 0 } },
      }),
    ).toThrow();
    expect(() =>
      restoreVehicleSnapshot({
        ...snapshot,
        snapshotVersion: "vehicle-snapshot-1",
      }),
    ).toThrow();
    expect(() =>
      restoreVehicleSnapshot({
        ...snapshot,
        initial: { ...snapshot.initial, speed: 2 },
      }),
    ).toThrow();
    expect(() =>
      restoreVehicleSnapshot({
        ...snapshot,
        initial: { position: { x: 0, y: 0 } },
      }),
    ).toThrow();
    expect(() =>
      restoreVehicleSnapshot({
        ...snapshot,
        initial: { ...snapshot.initial, wheelSpeeds: { front: 0 } },
      }),
    ).toThrow();
  });
});
