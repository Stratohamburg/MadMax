import { describe, expect, it } from "vitest";
import { applyProfile, derived, getProfile, MODEL_VERSION, PROFILES, validateProfile } from "../../src/vehicle/physics";
import { createState } from "../../src/vehicle/physics/state";
import { advancePhysical, applyExternalImpulse, mechanicalEnergy, physicalObservation } from "../../src/vehicle/physics/physical";
import { geometry } from "../../src/vehicle/physics/geometry";
import { createVehicleSnapshot, restoreVehicleSnapshot } from "../../src/vehicle/snapshot";
import { step } from "../../src/vehicle/physics/dynamics";
import baseline from "../fixtures/vehicle-physics-2-baseline.json";
import { CATALOG, compose, emptyLoadout, stockLoadout, validateLoadout } from "../../src/loadout";
import type { InstalledPart } from "../../src/loadout";
import { advanceAssemblyDrive, advanceBoost, advanceDrivetrain, createAssemblyDrive } from "../../src/vehicle/assembly-drive";
import { evaluateAttribute } from "../../src/stats/modifiers";

describe("v3 质心、外力与版本", () => {
  it("拒绝 v2 profile 与 snapshot，v3 快照可继续逐步一致地模拟", () => {
    const p = getProfile("sports-car"), state = createState(p);
    expect(MODEL_VERSION).toBe("vehicle-physics-5");
    expect(validateProfile({ ...p, modelVersion: "vehicle-physics-2", profileSchemaVersion: "vehicle-profile-2" }).length).toBeGreaterThan(0);
    expect(applyProfile(p, { ...p, profileSchemaVersion: "vehicle-profile-2" }).profile).toBe(p);
    const snapshot = createVehicleSnapshot(state, p, "assembly-test");
    expect(() => restoreVehicleSnapshot({ ...snapshot, snapshotVersion: "vehicle-snapshot-2" })).toThrow("版本");
    const restored = restoreVehicleSnapshot(JSON.parse(JSON.stringify(snapshot)));
    const intent = { targetSpeed: 6, angle: 0.3, drift: false };
    expect(step(restored.state, intent, restored.profile)).toEqual(step(state, intent, p));
  });
  it("横向质心改变轮廓与接地点速度，纵向质心改变轴荷", () => {
    const p = getProfile("sports-car");
    p.geometry.cgLateral = 0.1;
    p.geometry.cgFromRear = 0.6;
    expect(validateProfile(p)).toEqual([]);
    const state = createState(p, { r: 1 });
    const g = geometry(state, p), observation = physicalObservation(state, p);
    expect(g.frontAxle.y).toBe(-0.1);
    expect(g.rearAxle.y).toBe(-0.1);
    expect(g.frontAxle.x).toBeCloseTo(p.geometry.wheelbase * 0.4);
    expect(observation.front.transport).toBeCloseTo(0.1);
    expect(observation.loads.front / observation.loads.total).toBeCloseTo(0.6);
    expect(g.footprint.every(v => Math.hypot(v.x, v.y) <= g.conservativeRadius)).toBe(true);
  });
  it("挂点冲量产生解析平移和横摆，能量计入 externalWork", () => {
    const p = getProfile("sports-car"), state = createState(p);
    const next = applyExternalImpulse(state, p, { x: -2, y: 0 }, { x: 0, y: 0.2 });
    expect(next.worldVelocity.x).toBe(-2 / p.mass);
    expect(next.r).toBeCloseTo(0.4 / derived(p).inertia);
    expect(next.energy.externalWork).toBeCloseTo(mechanicalEnergy(next, p));
    expect(state.speed).toBe(0);
    expect(() => applyExternalImpulse(state, p, { x: NaN, y: 0 })).toThrow("非有限");
  });
  it("有限助推与外力单独记功，接触求解的能量残差仍小", () => {
    const p = getProfile("sports-car"), state = createState(p);
    const next = advancePhysical(state, { steeringTarget: 0, drive: 0, brake: 0, rearBrake: 0,
      boostForce: 4, externalForce: { x: 1, y: 0.5 }, externalTorque: 0.1 }, p, 1 / 240);
    expect(next.energy.boostWork).toBeGreaterThan(0);
    expect(next.energy.externalWork).toBeGreaterThan(0);
    const balance = mechanicalEnergy(next, p) - mechanicalEnergy(state, p) - next.energy.boostWork - next.energy.externalWork +
      next.energy.tireDissipation + next.energy.brakeDissipation + next.energy.rollingDissipation;
    expect(Math.abs(balance)).toBeLessThan(1e-9);
    expect(Math.abs(next.energy.numericalResidual)).toBeLessThan(1e-9);
  });
});

describe("v2 行为基线", () => {
  it("十车型直行、转向和漂移与升级前捕获的数据一致", () => {
    expect(baseline.modelVersion).toBe("vehicle-physics-2");
    expect(baseline.results).toHaveLength(PROFILES.length);
    for (const record of baseline.results) {
      const p = compose(emptyLoadout(record.profileId)).profile;
      expect(p).toEqual(getProfile(record.profileId));
      for (const expected of record.cases) {
        let state = createState(p);
        for (let i = 0; i < baseline.steps; i++) state = step(state, {
          targetSpeed: p.power.maxSpeed * 0.7,
          angle: i < 120 || expected.mode === "straight" ? 0 : 0.65,
          drift: expected.mode === "drift" && i >= 120,
        }, p);
        for (const axis of ["x", "y"] as const) {
          expect(state.position[axis]).toBeCloseTo(expected.position[axis], 9);
          expect(state.worldVelocity[axis]).toBeCloseTo(expected.velocity[axis], 9);
        }
        expect(state.theta).toBeCloseTo(expected.theta, 9);
        expect(state.r).toBeCloseTo(expected.r, 9);
        expect(state.delta).toBeCloseTo(expected.delta, 9);
        expect(state.wheelSpeeds.front).toBeCloseTo(expected.wheelSpeeds.front, 12);
        expect(state.wheelSpeeds.rear).toBeCloseTo(expected.wheelSpeeds.rear, 12);
      }
    }
  });
});

const mounted = (partId: string, x: number, y = 0): InstalledPart => ({ instanceId: `test:${partId}`, partId, x, y, layer: CATALOG.parts[partId].layer, rotation: 0, facing: 0 });
describe("装配派生", () => {
  it("前置和侧置质量满足质量加权与平行轴公式，前轴荷增加", () => {
    const loadout = { ...emptyLoadout("sports-car"), parts: [mounted("cannon", 4, 1)] };
    const result = compose(loadout), base = getProfile("sports-car");
    const addedMass = CATALOG.parts.cannon.massKg / 1000;
    expect(result.profile.mass).toBe(base.mass + addedMass);
    expect(result.centerOfMass.x).toBeCloseTo(addedMass * 4 * 0.12 / result.profile.mass);
    expect(result.centerOfMass.y).toBeCloseTo(addedMass * 0.12 / result.profile.mass);
    expect(result.summary.frontLoadRatio).toBeGreaterThan(base.geometry.cgFromRear);
    expect(result.inertia).toBeGreaterThan(derived(base).inertia);
    expect(compose(loadout)).toEqual(result);
    const rear = compose({ ...loadout, parts: [mounted("cannon", -4)] });
    expect(rear.summary.frontLoadRatio).toBeLessThan(base.geometry.cgFromRear);
    expect(rear.mounts[0].position.x).toBeCloseTo(-4 * 0.12 - rear.centerOfMass.x);
  });
  it("共享分层算得270，极端加成截断并告警，结果始终合法", () => {
    const modifiers = [
      { id: "a", source: "a", group: "a", target: "vehicle" as const, attribute: "power", layer: "flat" as const, value: 20 },
      { id: "b", source: "b", group: "b", target: "vehicle" as const, attribute: "power", layer: "increased" as const, value: 0.5 },
      { id: "c", source: "c", group: "c", target: "vehicle" as const, attribute: "power", layer: "more" as const, value: 1.5 },
    ];
    expect(evaluateAttribute(100, modifiers, "vehicle", "power").value).toBe(270);
    const result = compose(stockLoadout("sports-car"), { modifiers: [{ ...modifiers[0], attribute: "grip", value: 1000 }] });
    expect(validateProfile(result.profile)).toEqual([]);
    expect(result.summary.clamped.some(c => c.path.endsWith("muY"))).toBe(true);
  });
  it("十车型预设可驾驶，缺座位或油箱/发动机时不输出动力", () => {
    for (const profile of PROFILES) expect(compose(stockLoadout(profile.profileId)).summary.canDrive).toBe(true);
    const stock = stockLoadout("sports-car");
    for (const missing of ["driver-seat", "fuel-tank", "engine-l4", "gearbox"]) {
      const composition = compose({ ...stock, parts: stock.parts.filter(p => p.partId !== missing) });
      expect(composition.summary.canDrive).toBe(false);
      const initial = createAssemblyDrive(composition);
      const next = advanceAssemblyDrive(initial, { targetSpeed: 10, angle: 0, drift: false }, composition);
      expect(next.vehicle.speed).toBe(0);
    }
  });
  it("损伤只衰减性能，毁坏内部件仍保留质量", () => {
    const loadout = stockLoadout("sports-car"), base = compose(loadout);
    const engine = loadout.parts.find(p => p.partId === "engine-l4")!;
    const damaged = compose(loadout, { health: { [engine.instanceId]: 0.5 } });
    expect(damaged.engine!.maxPower).toBe(base.engine!.maxPower * 0.5);
    const destroyed = compose(loadout, { health: { [engine.instanceId]: 0 } });
    expect(destroyed.summary.canDrive).toBe(false);
    expect(destroyed.profile.mass).toBe(base.profile.mass);
  });
});

describe("动力链和喷射控制", () => {
  it("达到阈值后自动升挡，断动力持续至换挡结束，RPM 降低", () => {
    const composition = compose(stockLoadout("sports-car")), initial = createAssemblyDrive(composition);
    const engine = composition.engine!, gearbox = composition.gearbox!;
    const wheelSpeed = engine.redlineRpm * 0.9 * Math.PI / 30 / (gearbox.ratios[0] * gearbox.finalDrive);
    let result = advanceDrivetrain(initial.drivetrain, composition, wheelSpeed, 1, 1 / 120);
    const rpmBefore = result.state.rpm;
    expect(result.shifting).toBe(true);
    expect(result.wheelForce).toBe(0);
    expect(result.state.targetGear).toBe(2);
    for (let i = 0; i < Math.ceil(gearbox.shiftTime * 120); i++) {
      result = advanceDrivetrain(result.state, composition, wheelSpeed, 1, 1 / 120);
      expect(result.wheelForce).toBe(0);
    }
    expect(result.state.gear).toBe(2);
    expect(result.state.rpm).toBeLessThan(rpmBefore);
    result = advanceDrivetrain(result.state, composition, wheelSpeed, 1, 1 / 120);
    expect(result.wheelForce).toBeGreaterThan(0);
    expect(result.torque).toBeLessThanOrEqual(gearbox.maxInputTorque);
  });
  it("低转速自动降挡，卡车起步推力储备明显高于跑车", () => {
    const car = compose(stockLoadout("sports-car")), truck = compose(stockLoadout("truck"));
    const carInitial = createAssemblyDrive(car), truckInitial = createAssemblyDrive(truck);
    const down = advanceDrivetrain({ ...carInitial.drivetrain, gear: 3, targetGear: 3 }, car, 0, 1, 1 / 120);
    expect(down.state.targetGear).toBe(2);
    const carForce = advanceDrivetrain(carInitial.drivetrain, car, 0, 1, 1 / 120).wheelForce;
    const truckForce = advanceDrivetrain(truckInitial.drivetrain, truck, 0, 1, 1 / 120).wheelForce;
    expect(truckForce / truck.profile.mass).toBeGreaterThan(carForce / car.profile.mass);
    const approximateAcceleration = (force: number, mass: number) => Math.min(force / mass, 9.81);
    const added = 0.5;
    const carLoss = 1 - approximateAcceleration(carForce, car.profile.mass + added) / approximateAcceleration(carForce, car.profile.mass);
    const truckLoss = 1 - approximateAcceleration(truckForce, truck.profile.mass + added) / approximateAcceleration(truckForce, truck.profile.mass);
    expect(carLoss).toBeGreaterThan(truckLoss);
  });
  it("喷射持续有限、耗能、进入冷却且无能量时不能触发", () => {
    const stock = stockLoadout("sports-car");
    const composition = compose({ ...stock, parts: [...stock.parts, mounted("booster", 5)] });
    let state = { remaining: 0, cooldown: 0 }, energy = 100, totalImpulse = 0;
    for (let i = 0; i < 200; i++) {
      const result = advanceBoost(state, composition, energy, true, 1 / 120);
      totalImpulse += result.force / 120; state = result.state; energy = result.energy;
    }
    expect(totalImpulse).toBeCloseTo(composition.boost.force * composition.boost.duration, 8);
    expect(state.cooldown).toBeGreaterThan(0);
    expect(energy).toBeCloseTo(100 - composition.boost.duration * composition.boost.energy, 8);
    expect(advanceBoost({ remaining: 0, cooldown: 0 }, composition, 0, true, 1 / 120).force).toBe(0);
  });
  it("完整动力链与轮胎模拟中，同样重炮让跑车达到共同速度的耗时增幅大于卡车", () => {
    const losses = ["sports-car", "truck"].map(id => {
      const stock = stockLoadout(id), loaded = { ...stock, parts: [...stock.parts, mounted("cannon", 4)] };
      const times = [stock, loaded].map(loadout => {
        const composition = compose(loadout); let drive = createAssemblyDrive(composition);
        for (let i = 0; i < 1200; i++) {
          drive = advanceAssemblyDrive(drive, { targetSpeed: 20, angle: 0, drift: false }, composition);
          if (drive.vehicle.speed >= 5) return (i + 1) / 120;
        }
        throw new Error("未达到共同速度");
      });
      expect(times[1]).toBeGreaterThan(times[0]); return times[1] / times[0] - 1;
    });
    expect(losses[0]).toBeGreaterThan(0.1); expect(losses[0]).toBeGreaterThan(losses[1]);
  });
  it("固定步长驾驶状态可JSON往返后续算，燃油只减少", () => {
    const composition = compose(stockLoadout("sports-car"));
    let state = createAssemblyDrive(composition);
    const input = { targetSpeed: 8, angle: 0, drift: false };
    for (let i = 0; i < 120; i++) state = advanceAssemblyDrive(state, input, composition);
    const plain = JSON.parse(JSON.stringify(state));
    plain.vehicle = createState(composition.profile, {
      position: plain.vehicle.position, worldVelocity: plain.vehicle.worldVelocity, theta: plain.vehicle.theta,
      r: plain.vehicle.r, delta: plain.vehicle.delta, wheelSpeeds: plain.vehicle.wheelSpeeds,
      longitudinalForces: plain.vehicle.longitudinalForces, tires: plain.vehicle.tires, previousLongAcceleration: plain.vehicle.previousLongAcceleration,
      time: plain.vehicle.time, energy: plain.vehicle.energy, assist: plain.vehicle.assist,
    });
    expect(advanceAssemblyDrive(plain, input, composition)).toEqual(advanceAssemblyDrive(state, input, composition));
    expect(state.drivetrain.fuel).toBeLessThan(composition.resources.fuelCapacity);
    expect(state.vehicle.speed).toBeGreaterThan(0);
    expect(validateLoadout(composition.loadout)).toEqual([]);
  });
});
