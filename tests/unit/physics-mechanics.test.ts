import { describe, expect, it } from "vitest";
import { advanceBoost, advanceDrivetrain, drivetrainCapacity, validateDrivetrain } from "../../src/vehicle/physics/mechanics";
import type { DrivetrainParameters, DrivetrainState } from "../../src/vehicle/physics/mechanics";
import { observe } from "../../src/vehicle/physics/dynamics";
import { compose, stockLoadout } from "../../src/loadout";
import { advanceAssemblyDrive, createAssemblyDrive, migrateAssemblyDrive, relocateAssemblyDrive } from "../../src/vehicle/assembly-drive";
import { damageModule, createModules, moduleComposition } from "../../src/combat/modules";

const parameters: DrivetrainParameters = {
  engine: { idleRpm: 800, redlineRpm: 7000, maxPower: 170, maxTorque: 240,
    torqueCurve: [[800, 0.5], [2500, 0.85], [4500, 1], [7000, 0.65]], fuelConsumption: 0.012 },
  gearbox: { ratios: [3.6, 2.3, 1.55], finalDrive: 4.1, shiftTime: 0.22, efficiency: 0.92, maxInputTorque: 400 }, wheelRadius: 0.12,
};
const initial: DrivetrainState = { gear: 1, targetGear: 1, rpm: 800, shiftRemaining: 0, fuel: 40 };
describe("独立核心动力链", () => {
  it("无需装配、模式或路线，轮端力符合解析扭矩/齿比公式", () => {
    validateDrivetrain(parameters);
    const speed = 4500 * Math.PI / 30 / (3.6 * 4.1);
    const result = advanceDrivetrain(initial, parameters, speed, 0.5, 1 / 120);
    expect(result.torque).toBeCloseTo(120);
    expect(result.wheelForce).toBeCloseTo(120 * 3.6 * 4.1 * 0.92 / (2500 * 0.12));
    expect(initial.fuel).toBe(40);
  });
  it("加成后的扭矩和功率仍受变速箱承载限制，诊断与实际轮端力一致", () => {
    const p = { ...parameters, engine: { ...parameters.engine!, maxTorque: 2400, maxPower: 1700 } };
    const speed = 4500 * Math.PI / 30 / (3.6 * 4.1);
    const result = advanceDrivetrain(initial, p, speed, 1, 1 / 120);
    const reflected = result.wheelForce * 2500 * p.wheelRadius / (3.6 * 4.1 * 0.92);
    expect(reflected).toBeCloseTo(400); expect(result.torque).toBeCloseTo(reflected);
    const lowPower = { ...p, engine: { ...p.engine, maxPower: 10 } };
    expect(advanceDrivetrain(initial, lowPower, speed, 1, 1 / 120).torque).toBeCloseTo(9550 * 10 / 4500);
  });
  it("换挡期间能力与输出均为零，接合后RPM回落，JSON续算一致", () => {
    const speed = 6300 * Math.PI / 30 / (3.6 * 4.1);
    let result = advanceDrivetrain(initial, parameters, speed, 1, 1 / 120, 2);
    expect(result.shifting).toBe(true);
    const rpm = result.state.rpm;
    expect(drivetrainCapacity(result.state, parameters, speed).wheelForce).toBe(0);
    for (let i = 0; i < 27; i++) result = advanceDrivetrain(result.state, parameters, speed, 1, 1 / 120);
    expect(result.state.gear).toBe(2); expect(result.state.rpm).toBeLessThan(rpm);
    expect(advanceDrivetrain(JSON.parse(JSON.stringify(result.state)), parameters, speed, 0.6, 1 / 120))
      .toEqual(advanceDrivetrain(result.state, parameters, speed, 0.6, 1 / 120));
  });
  it("燃油不足只按最后可用供给输出，不产生负油量", () => {
    const last = advanceDrivetrain({ ...initial, fuel: 0.00001 }, parameters, 0, 1, 1 / 120);
    expect(last.wheelForce).toBeGreaterThan(0);
    expect(last.wheelForce).toBeLessThan(drivetrainCapacity(initial, parameters, 0).wheelForce);
    expect(last.state.fuel).toBe(0);
    expect(advanceDrivetrain(last.state, parameters, 0, 1, 1 / 120).wheelForce).toBe(0);
  });
  it("拒绝无效曲线、挡位和非有限输入", () => {
    expect(() => validateDrivetrain({ ...parameters, gearbox: { ...parameters.gearbox!, ratios: [0] } })).toThrow();
    expect(() => validateDrivetrain({ ...parameters, engine: { ...parameters.engine!, torqueCurve: [[1000, 1], [1000, 2]] } })).toThrow();
    expect(() => advanceDrivetrain({ ...initial, gear: 0 }, parameters, 0, 1, 1 / 120)).toThrow();
    expect(() => advanceDrivetrain(initial, parameters, NaN, 1, 1 / 120)).toThrow();
  });
  it("有限助推在核心独立耗能、断推和冷却，不接收驾驶模式", () => {
    const boost = { force: 4, duration: 1, cooldown: 5, energy: 10 };
    const last = advanceBoost({ remaining: 0.1, cooldown: 0 }, boost, 0.02, false, 1 / 120);
    expect(last.force / 120).toBeCloseTo(4 * 0.002);
    expect(last.energy).toBe(0); expect(last.state.remaining).toBe(0); expect(last.state.cooldown).toBe(5);
  });
});

describe("机械能力与装配接入", () => {
  it("装配动力加成修改有效发动机，最终输出不越过变速箱", () => {
    const c = compose(stockLoadout("sports-car"), { modifiers: [{ id: "power", source: "test", group: "test", target: "vehicle", attribute: "power", layer: "more", value: 2 }] });
    expect(c.engine!.maxTorque).toBe(480); expect(c.engine!.maxPower).toBe(340);
    const p = { engine: c.engine, gearbox: c.gearbox, wheelRadius: c.profile.wheels.radius };
    const wheelSpeed = 4500 * Math.PI / 30 / (c.gearbox!.ratios[0] * c.gearbox!.finalDrive);
    expect(advanceDrivetrain(initial, p, wheelSpeed, 1, 1 / 120).torque).toBe(400);
  });
  it("不同挡位与轮速下实际力等于真实能力乘控制请求，保留牵引预算", () => {
    const c = compose(stockLoadout("off-road"));
    for (const [speed, gear] of [[2, 1], [4, 1], [8, 2], [3, 3]]) {
      const drive = createAssemblyDrive(c, { worldVelocity: { x: speed, y: 0 } });
      drive.drivetrain.gear = drive.drivetrain.targetGear = gear;
      const wheel = drive.vehicle.wheelSpeeds.front * c.profile.power.driveFront + drive.vehicle.wheelSpeeds.rear * (1 - c.profile.power.driveFront);
      const capacity = drivetrainCapacity(drive.drivetrain, { engine: c.engine, gearbox: c.gearbox, wheelRadius: c.profile.wheels.radius }, wheel).wheelForce;
      const intent = { targetSpeed: 10, angle: 0.7, drift: false };
      const command = observe(drive.vehicle, c.profile, intent, { driveCapacity: capacity }).command;
      const next = advanceAssemblyDrive(drive, intent, c);
      expect(next.output.driveRequest).toBeGreaterThanOrEqual(0);
      expect(next.output.driveRequest).toBeLessThanOrEqual(1);
      expect(next.output.driveForce).toBeLessThanOrEqual(next.output.driveCapacity! + 1e-10);
      if (!next.output.shifting) expect(next.output.driveForce).toBeCloseTo(next.output.driveCapacity! * next.output.driveRequest!, 9);
    }
  });
  it("断油或发动机毁坏后滑行仍能转向与制动，初始惯性保持", () => {
    const modules = createModules(stockLoadout("sports-car")), c = moduleComposition(modules);
    const engine = modules.loadout.parts.find(p => p.partId === "engine-l4")!;
    const damaged = moduleComposition(damageModule(modules, engine.instanceId, 1000));
    for (const composition of [c, damaged]) {
      const drive = createAssemblyDrive(composition, { worldVelocity: { x: 3, y: 0 }, r: 0.3 }); drive.drivetrain.fuel = 0;
      const next = advanceAssemblyDrive(drive, { targetSpeed: 0, angle: 1, drift: false }, composition);
      expect(next.vehicle.delta).not.toBe(drive.vehicle.delta);
      expect(next.output.driveForce).toBe(0); expect(next.vehicle.speed).toBeGreaterThan(2.8); expect(next.vehicle.r).not.toBe(0);
      expect(next.vehicle.energy.brakeDissipation).toBeGreaterThan(0);
    }
  });
  it("迁移、暂停恢复及显式拖车不补满资源或清除冷却", () => {
    const c = compose(stockLoadout("sports-car"));
    const drive = createAssemblyDrive(c, { worldVelocity: { x: 0.1, y: 0 }, r: 0.04, delta: 0.2 });
    drive.drivetrain.fuel = 3; drive.energy = 7; drive.boost.cooldown = 4;
    const migrated = migrateAssemblyDrive(drive, c, compose(c.loadout));
    expect(migrated).toEqual(drive);
    const towed = relocateAssemblyDrive(migrated, c, { x: 4, y: 1 }, 0.5);
    expect(towed.vehicle.speed).toBe(0); expect(towed.vehicle.r).toBe(0);
    expect(towed.drivetrain.fuel).toBe(3); expect(towed.energy).toBe(7); expect(towed.boost.cooldown).toBe(4);
  });
});
