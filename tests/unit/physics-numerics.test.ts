import { describe, expect, it } from 'vitest';
import { createState, derived, observe, REFERENCE_PROFILE as p, step, RULES, rad, wrap, collisionStop, validateProfile } from '../../src/vehicle/physics';
import type { VehicleProfile, VehicleState } from '../../src/vehicle/physics';
import { FixedClock } from '../../src/simulation/clock';

const intentAt = (t: number) => ({ targetSpeed: t < 8 ? 6 : 0, angle: t < 2 ? 0 : t < 4 ? 0.45 : t < 7 ? -0.3 : null, drift: t >= 3 && t < 6 });
function replay(profile: VehicleProfile, fps: number, seconds = 10, substep = 1 / 240) {
  let s = createState(profile); const clock = new FixedClock(); clock.advance(0, () => {});
  for (let frame = 1; frame <= fps * seconds; frame++) clock.advance(frame / fps, dt => { s = step(s, intentAt(clock.steps * dt), profile, dt, { substep }); });
  return s;
}
describe('数值稳定与生命周期', () => {
  it('合法关联边界：低质量同比缩放、极端质心比例/高度及前驱份额', () => {
    const light = structuredClone(p); light.mass = 0.1; light.power.driveForce *= 0.1; light.power.brakeForce *= 0.1;
    for (const t of Object.values(light.tires)) { t.stiffness *= 0.1; t.nominalLoad *= 0.1; }
    const tall = structuredClone(p); tall.kYaw = 0.35; tall.geometry.cgFromRear = 0.2; tall.geometry.heightCG = tall.geometry.wheelbase * 0.5; tall.power.driveFront = 1; tall.power.brakeFront = 0;
    const rear = structuredClone(p); rear.kYaw = 0.35; rear.geometry.cgFromRear = 0.8; rear.geometry.heightCG = 0; rear.power.driveFront = 0; rear.power.brakeFront = 1;
    for (const q of [light, tall, rear]) {
      expect(validateProfile(q)).toEqual([]); let s = createState(q);
      for (let i = 0; i < 600; i++) {
        s = step(s, { targetSpeed: i < 400 ? 5 : 0, angle: i < 120 ? Math.PI / 2 : i < 300 ? -0.4 : 0, drift: i >= 120 && i < 250 }, q);
        const o = observe(s, q); expect(s.u).toBeGreaterThanOrEqual(-1e-9); expect(Number.isFinite(s.speed)).toBe(true);
        expect(o.loads.front).toBeGreaterThanOrEqual(0); expect(o.loads.rear).toBeGreaterThanOrEqual(0); expect(o.loads.front + o.loads.rear).toBeCloseTo(q.mass * RULES.gravity, 8);
        expect(o.front.utilization).toBeLessThanOrEqual(1 + 1e-9); expect(o.rear.utilization).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
  it('零/单轴/双轴瞬态无动力总能量不持续增加，预算与耗散有效', () => {
    for (const [front, rear] of [[0, 0], [0.12, 0], [0, 0.12], [0.12, 0.18]]) {
      const q = structuredClone(p); q.tires.front.relaxation = front; q.tires.rear.relaxation = rear;
      let s = createState(q, { worldVelocity: { x: 6, y: 1 }, r: 0.5, delta: 0.1 });
      const initial = observe(s, q).energy.total; let maxGrowth = 0, previous = initial;
      for (let i = 0; i < 600; i++) {
        s = step(s, { targetSpeed: 0, angle: null, drift: false }, q, 1 / 120, { coast: true, fixedSteering: i < 150 ? -0.15 : i < 300 ? 0.15 : 0 });
        const o = observe(s, q); maxGrowth = Math.max(maxGrowth, o.energy.total - previous); previous = o.energy.total;
        expect(o.front.utilization).toBeLessThanOrEqual(1 + 1e-9); expect(o.rear.utilization).toBeLessThanOrEqual(1 + 1e-9);
        expect(o.front.power).toBeLessThanOrEqual(0); expect(o.rear.power).toBeLessThanOrEqual(0);
      }
      expect(previous).toBeLessThan(initial); expect(maxGrowth).toBeLessThan(initial * 0.0001);
    }
  });
  it('参考车1/480收敛和30/60/120FPS固定步回放', () => {
    for (const transient of [false, true]) {
      const q = structuredClone(p); if (transient) { q.tires.front.relaxation = 0.12; q.tires.rear.relaxation = 0.18; }
      const a = replay(q, 30), b = replay(q, 60), c = replay(q, 120);
      expect(a).toEqual(b); expect(a).toEqual(c);
      const coarse = replay(q, 120, 5), fine = replay(q, 120, 5, 1 / 480);
      expect(Math.hypot(coarse.position.x - fine.position.x, coarse.position.y - fine.position.y)).toBeLessThan(derived(q).bodyLength * 0.05);
      expect(Math.abs(wrap(coarse.theta - fine.theta))).toBeLessThan(rad(2));
    }
  });
  it('加速载荷因果历史与游戏代价隔离，停车后清全部旧力', () => {
    let s = createState(p); expect(observe(s, p).loads.transfer).toBe(0);
    for (let i = 0; i < 30; i++) s = step(s, { targetSpeed: 6, angle: 0, drift: false }, p);
    expect(s.previousLongAcceleration).toBeGreaterThan(0); expect(observe(s, p).loads.transfer).toBeGreaterThan(0);
    const o = observe(s, p, { targetSpeed: 6, angle: Math.PI, drift: true }); expect(o.game.deceleration).toBeGreaterThan(0); expect(o.loads.transfer).toBe(observe(s, p).loads.transfer);
    const stopped = collisionStop(p, s); const next = step(stopped, { targetSpeed: 0, angle: null, drift: false }, p);
    expect(next.worldVelocity).toEqual({ x: 0, y: 0 }); expect(next.r).toBe(0); expect(next.tires).toEqual({ front: 0, rear: 0 }); expect(next.previousLongAcceleration).toBe(0);
  });
  it('后向目标与快速切换有限、不倒车；低速几何夹角不被计作硬保护', () => {
    let s = createState(p);
    for (let i = 0; i < 1800; i++) {
      s = step(s, { targetSpeed: i < 1600 ? 6 : 0, angle: i < 500 ? Math.PI : (Math.floor(i / 120) % 2 ? 1 : -1) * 1.4, drift: i % 200 < 100 }, p);
      expect(s.u).toBeGreaterThanOrEqual(-1e-10); expect(s.speed).toBeLessThanOrEqual(p.power.maxSpeed + 1e-9); expect(Math.abs(s.beta)).toBeLessThan(RULES.hardSlip + 1e-9);
    }
    const k = step(createState(p, { worldVelocity: { x: 0.3, y: 0 }, delta: rad(20) }), { targetSpeed: 0.3, angle: 0, drift: false }, p, 1 / 120, { fixedSteering: rad(20) }); expect(k.protection.count).toBe(0);
  });
});
