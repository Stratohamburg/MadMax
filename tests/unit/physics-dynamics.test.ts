import { describe, expect, it } from 'vitest';
import { createPhysics, createState, derived, REFERENCE_PROFILE as p, step, observe, SURFACES, rad, angleError, RULES, collisionStop } from '../../src/vehicle/physics';
import type { VehicleProfile, VehicleState, Intent, StepOptions } from '../../src/vehicle/physics';
import { lateralCurve, combinedForce, relaxTire, tireProperties } from '../../src/vehicle/physics/tires';
import { availableForces, gameLoss } from '../../src/vehicle/physics/powertrain';

export function run(s: VehicleState, intent: Intent, seconds: number, profile = p, options: StepOptions = {}): VehicleState {
  for (let i = 0; i < Math.round(seconds * 120); i++) s = step(s, intent, profile, 1 / 120, options);
  return s;
}
describe('非线性轮胎／组合预算／被动瞬态', () => {
  it('正负扫描、刚度、峰位、连续性、有界及峰后平台', () => {
    const t = p.tires.front, peak = t.shape * 5 / t.stiffness;
    expect(lateralCurve(0, 70, 5, t)).toBe(0);
    expect(lateralCurve(1e-9, 70, 5, t) / 1e-9).toBeCloseTo(-70, 4);
    expect(lateralCurve(peak, 70, 5, t)).toBeCloseTo(-5);
    expect(lateralCurve(peak - 1e-7, 70, 5, t)).toBeCloseTo(lateralCurve(peak + 1e-7, 70, 5, t), 8);
    for (let a = 0.01; a < 1.5; a += 0.01) { expect(lateralCurve(-a, 70, 5, t)).toBe(-lateralCurve(a, 70, 5, t)); expect(Math.abs(lateralCurve(a, 70, 5, t))).toBeLessThanOrEqual(5 + 1e-12); }
    expect(lateralCurve(1, 70, 5, { ...t, slide: 1 })).toBe(-5);
    expect(Math.abs(lateralCurve(1, 70, 5, t))).toBeCloseTo(5 * t.slide, 2);
  });
  it('组合抓地椭圆与零预算；纵向占用减少侧向余量', () => {
    for (let fx = -10; fx <= 10; fx += 0.5) { const c = combinedForce(fx, 9, 5, 6); expect(c.utilization).toBeLessThanOrEqual(1 + 1e-12); }
    expect(combinedForce(4, 5, 5, 6).fy).toBeLessThan(combinedForce(0, 5, 5, 6).fy);
    expect(combinedForce(3, 5, 0, 0)).toMatchObject({ fx: 0, fy: 0 });
    expect(combinedForce(3, 5, 0, 6).fy).toBe(5);
  });
  it('载荷敏感与刚度规律，关闭系数回到常μ基准', () => {
    const t = { ...p.tires.front, loadSensitivity: 0.2, stiffnessExponent: 0.8 };
    const low = tireProperties(t, t.nominalLoad / 2, SURFACES.hard), high = tireProperties(t, t.nominalLoad * 2, SURFACES.hard);
    expect(low.muY).toBeGreaterThan(high.muY); expect(low.stiffness).toBeLessThan(high.stiffness);
    const zero = { ...t, loadSensitivity: 0 }; expect(tireProperties(zero, 3, SURFACES.hard).muY).toBe(tireProperties(zero, 8, SURFACES.hard).muY);
  });
  it('瞬态独立开关、时间响应、预算下降投影及功率非正', () => {
    const immediate = relaxTire(0, -4, 1, 5, 0, 5, 1 / 240), lag = relaxTire(0, -4, 1, 5, 0.2, 5, 1 / 240);
    expect(immediate.force).toBe(-4); expect(lag.force).toBeLessThan(0); expect(lag.force).toBeGreaterThan(-4);
    expect(relaxTire(-5, -1, 1, 1, 0.2, 5, 1 / 240).force).toBe(-1);
    expect(relaxTire(-4, 4, -1, 5, 0.2, 5, 1 / 240).power).toBeLessThanOrEqual(0);
    expect(relaxTire(5, 4, 0, 5, 0.2, 0, 1 / 240).force).toBe(0);
    const nearZero = relaxTire(-4, 0, 1e-9, 5, 0.2, 5, 1 / 240);
    expect(Math.abs(nearZero.force)).toBeLessThan(1e-6);
  });
});
describe('受力与积分合同', () => {
  it('同参数换标签结果一致，观测与权威状态一致', () => {
    const s = createState(p, { worldVelocity: { x: 4, y: 0 } }), input = { targetSpeed: 6, angle: 0.3, drift: false };
    const q = { ...p, label: '任意', category: '任意', profileId: 'different' };
    const a = run(s, input, 0.5), b = run(s, input, 0.5, q); expect(a).toEqual(b);
    const o = observe(a, p, input); expect(o.speed).toBe(a.speed); expect(o.beta).toBe(a.beta); expect(o.geometry.frontAxle.x).toBeGreaterThan(a.position.x);
    expect(createPhysics(p).create()).toEqual(createState(p));
  });
  it('力矩左右符号、翻倍惯量及反打不立即翻转r', () => {
    const s = createState(p, { worldVelocity: { x: 6, y: 0 }, delta: rad(10), r: 0.4 });
    const a = observe(s, p, undefined, { fixedSteering: rad(10) });
    const q = { ...p, kYaw: p.kYaw * 2 };
    const n = step(s, { targetSpeed: 6, angle: 0, drift: false }, p, 1 / 120, { fixedSteering: -0.3 }); expect(n.r).toBeGreaterThan(0);
    expect(a.yawMoment).toBeGreaterThan(0); expect(a.yawMoment / derived(q).inertia).toBeCloseTo(a.yawMoment / derived(p).inertia / 2);
    const left = observe(createState(p, { worldVelocity: { x: 6, y: 0 }, delta: -rad(10), r: -0.4 }), p); expect(left.yawMoment).toBeCloseTo(-a.yawMoment);
    const coast = run(createState({ ...p, power: { ...p.power, rolling: 0 } }, { worldVelocity: { x: 6, y: 0 } }), { targetSpeed: 0, angle: null, drift: false }, 1, { ...p, power: { ...p.power, rolling: 0 } }, { coast: true, fixedSteering: 0 }); expect(coast.position.x).toBeCloseTo(6); expect(coast.speed).toBe(6);
  });
  it('质量相关量同比缩放不变；单独加质量提速下降', () => {
    const q = structuredClone(p); q.mass *= 3; q.power.driveForce *= 3; q.power.brakeForce *= 3; q.power.aero *= 3;
    for (const t of Object.values(q.tires)) { t.stiffness *= 3; t.nominalLoad *= 3; }
    const input = { targetSpeed: 6, angle: 0.25, drift: false };
    const a = run(createState(p), input, 1), b = run(createState(q), input, 1, q);
    expect(b.position.x).toBeCloseTo(a.position.x, 8); expect(b.theta).toBeCloseTo(a.theta, 8); expect(b.speed).toBeCloseTo(a.speed, 8);
    const heavy = structuredClone(q); heavy.power.driveForce = p.power.driveForce;
    expect(run(createState(heavy), { ...input, angle: 0 }, 0.5, heavy).speed).toBeLessThan(run(createState(p), { ...input, angle: 0 }, 0.5).speed);
  });
  it('动力曲线、半速追赶、降正目标、微小正目标与有限停车', () => {
    expect(availableForces(1, p).drive).toBeGreaterThan(availableForces(10, p).drive); expect(availableForces(1, p).brake).toBeLessThan(availableForces(10, p).brake);
    const input = { targetSpeed: 6, angle: 0, drift: false };
    const first = step(createState(p), input, p); expect(first.speed).toBeGreaterThan(0); expect(first.speed).toBeLessThan(6);
    const half = run(first, input, 5); expect(half.speed).toBeCloseTo(6, 2);
    const slow = run(half, { ...input, targetSpeed: 2 }, 3); expect(slow.speed).toBeCloseTo(2, 2);
    expect(run(slow, { ...input, targetSpeed: 0 }, 2).speed).toBe(0);
    expect(run(createState(p), { ...input, targetSpeed: 1e-12 }, 1).speed).toBeGreaterThan(0);
  });
  it('静止打轮车身不旋转、侧向起步、跨低速区和直线入漂', () => {
    const stop = run(createState(p), { targetSpeed: 0, angle: Math.PI / 2, drift: false }, 0.5); expect(stop.theta).toBe(0); expect(stop.r).toBe(0); expect(stop.delta).toBeGreaterThan(0);
    const start = run(stop, { targetSpeed: 3, angle: Math.PI / 2, drift: false }, 1); expect(start.position.x).toBeGreaterThan(0); expect(start.theta).toBeGreaterThan(0); expect(Number.isFinite(start.speed)).toBe(true);
    const straight = run(createState(p, { worldVelocity: { x: 6, y: 0 } }), { targetSpeed: 6, angle: 0, drift: true }, 1); expect(straight.beta).toBe(0); expect(straight.theta).toBe(0); expect(straight.assist.betaRef).toBe(0);
  });
  it('前后轴跨路面分别采样，低预算即时生效且标签不改变物理', () => {
    const s = createState(p, { worldVelocity: { x: 5, y: 1 }, delta: 0.1 });
    const input = { targetSpeed: 6, angle: 0, drift: false }, surface = (point: { x: number }) => point.x > 0 ? SURFACES.wet : SURFACES.hard;
    const o = observe(s, p, input, { surface }); expect(o.front.surface.family).toBe('wet'); expect(o.rear.surface.family).toBe('hard'); expect(o.front.capY).toBeLessThan(o.rear.capY);
    for (const t of [o.front, o.rear]) { expect(t.utilization).toBeLessThanOrEqual(1 + 1e-10); expect(t.power).toBeLessThanOrEqual(0); }
    const a = step(s, input, p, 1 / 120, { surface }); const b = step(s, input, p, 1 / 120, { surface: point => ({ ...surface(point), surfaceId: 'renamed' }) }); expect(a).toEqual(b);
  });
  it('游戏项按原态独立计算，封顶、模式差异及无目标为零', () => {
    const s = createState(p, { worldVelocity: { x: 12, y: 0 } });
    const loss = (angle: number, drift = false) => gameLoss(s, { targetSpeed: 12, angle: rad(angle), drift }, p).deceleration;
    expect(loss(4)).toBe(0); expect(loss(45)).toBeLessThan(loss(90)); expect(loss(90)).toBe(loss(120)); expect(loss(90)).toBe(loss(180)); expect(loss(45, true)).toBeGreaterThan(loss(45));
    expect(gameLoss(s, { targetSpeed: 0, angle: null, drift: false }, p).deceleration).toBe(0);
    expect(step(s, { targetSpeed: 12, angle: Math.PI / 2, drift: false }, p).speed).toBeLessThan(12);
  });
  it('路线角跨界、精确后方历史、无目标不追旧路线', () => {
    expect(angleError(rad(-179), rad(179))).toBeCloseTo(rad(2)); expect(angleError(Math.PI, 0, -1)).toBe(-Math.PI); expect(angleError(Math.PI, 0)).toBe(Math.PI);
    const s = createState(p, { worldVelocity: { x: 6, y: 0 }, assist: { routeRate: 1, betaRef: 0.1, turnSign: -1 } });
    const o = observe(s, p); expect(o.route.routeError).toBe(0); expect(o.route.routeRate).toBeLessThan(1);
    const stopped = collisionStop(p, s); expect(run(stopped, { targetSpeed: 0, angle: null, drift: false }, 1).r).toBe(0);
  });
});
