import { derived, RULES, validateProfile } from './config';
import type { VehicleProfile } from './config';
import { geometry, kinematic } from './geometry';
import { axleLoads, limitLongAcceleration } from './loads';
import { add, angleError, approach, clamp, dot, forward, norm, right, scale, smooth, wrap } from './math';
import type { Vec2 } from './math';
import { gameLoss, powerRequest } from './powertrain';
import { routeAssist } from './assist';
import { advanceSteering } from './steering';
import { dryHard, validateSurface } from './surfaces';
import type { SurfaceSampler } from './surfaces';
import { combinedForce, lateralCurve, relaxTire, tireProperties } from './tires';
import { createState, stateFrom } from './state';
import type { InitialState, Intent, VehicleState } from './state';

export interface StepOptions {
  surface?: SurfaceSampler;
  /** 仅验证入口：实际轮角仍受同一执行器约束。 */
  fixedSteering?: number;
  coast?: boolean;
  gameCost?: boolean;
  /** 验证用精度，不由渲染帧率选择。 */
  substep?: number;
}
function evaluate(s: VehicleState, input: Intent, p: VehicleProfile, dt: number, options: StepOptions, powerBase = s, powerDt = dt, memoryBase = s, relaxationDt = dt) {
  const d = derived(p), g = geometry(s, p), sample = options.surface ?? dryHard;
  const sf = sample(g.frontAxle, 'front', s.time), sr = sample(g.rearAxle, 'rear', s.time);
  validateSurface(sf); validateSurface(sr);
  const loads = axleLoads(p, s.previousLongAcceleration);
  const front = tireProperties(p.tires.front, loads.front, sf);
  const rear = tireProperties(p.tires.rear, loads.rear, sr, 1 + s.h * (p.drift.rearGrip - 1), 1 + s.h * (p.drift.rearStiffness - 1));
  const assist = routeAssist(s, input, p, Math.min(front.muY, rear.muY), front.stiffness, rear.stiffness, dt);
  const target = options.fixedSteering ?? assist.target;
  const deltaDot = (advanceSteering(s.delta, target, s.speed, p, dt) - s.delta) / dt;
  const hTarget = input.drift ? 1 : 0;
  const hDot = (approach(s.h, hTarget, input.drift ? p.drift.enterTime : p.drift.exitTime, 10, dt) - s.h) / dt;
  const vf = s.v + d.lf * s.r, vr = s.v - d.lr * s.r;
  const cos = Math.cos(s.delta), sin = Math.sin(s.delta);
  const slipF = vf * cos - s.u * sin, transportF = s.u * cos + vf * sin;
  const alphaF = Math.atan2(slipF, Math.max(transportF, 1e-8)), alphaR = Math.atan2(vr, Math.max(s.u, 1e-8));
  const power = powerRequest(powerBase, input, p, (sf.rolling + sr.rolling) / 2, powerDt, options.coast);
  const limitedRequest = limitLongAcceleration(p, power.request / p.mass) * p.mass;
  const loadIntervention = Math.abs(limitedRequest - power.request) > 1e-10;
  const share = power.request >= 0 ? p.power.driveFront : p.power.brakeFront;
  const cf = combinedForce(limitedRequest * share, lateralCurve(alphaF, front.stiffness, front.capY, p.tires.front), front.capX, front.capY);
  const cr = combinedForce(limitedRequest * (1 - share), lateralCurve(alphaR, rear.stiffness, rear.capY, p.tires.rear), rear.capX, rear.capY);
  const tf = relaxTire(memoryBase.tires.front, cf.fy, slipF, cf.lateralCap, p.tires.front.relaxation, transportF, relaxationDt);
  const tr = relaxTire(memoryBase.tires.rear, cr.fy, vr, cr.lateralCap, p.tires.rear.relaxation, s.u, relaxationDt);
  const blend = smooth((s.speed - RULES.lowSpeedStart) / (RULES.lowSpeedEnd - RULES.lowSpeedStart));
  const fx = cf.fx * cos - tf.force * sin + cr.fx;
  const fy = cf.fx * sin + tf.force * cos + tr.force;
  const moment = d.lf * (cf.fx * sin + tf.force * cos) - d.lr * tr.force;
  const physicalAcceleration = add(scale(forward(s.theta), fx / p.mass), scale(right(s.theta), fy / p.mass));
  const resistance = s.speed > 0 ? scale(s.worldVelocity, -power.resistance / (p.mass * s.speed)) : { x: 0, y: 0 };
  const game = gameLoss(s, input, p);
  const gameAcceleration = options.gameCost === false || s.speed === 0 ? { x: 0, y: 0 } : scale(s.worldVelocity, -game.deceleration / s.speed);
  const dynamicAcceleration = add(physicalAcceleration, resistance);
  const dynamicRDot = moment / d.inertia;
  const k = kinematic(s.speed, s.delta, p);
  const dbetaDdelta = (d.lr / p.geometry.wheelbase) / (Math.cos(s.delta) ** 2 * (1 + (d.lr / p.geometry.wheelbase * Math.tan(s.delta)) ** 2));
  const kRDot = s.speed === 0 ? 0 : (k.r - s.r) / RULES.lowSpeedResponse;
  const chiDot = k.r + dbetaDdelta * deltaDot + wrap(k.beta - s.beta) / RULES.lowSpeedResponse;
  let speedDot = dot(dynamicAcceleration, s.speed > 0 ? scale(s.worldVelocity, 1 / s.speed) : forward(s.theta));
  // 低速约束产生横摆动能时由平移动能支付，收回横摆只耗散，不凭空回充。
  if (s.speed > 0) speedDot -= Math.max(0, d.inertia * s.r * kRDot) / (p.mass * Math.max(s.speed, 0.01));
  const kAcceleration = add(scale(s.speed > 0 ? scale(s.worldVelocity, 1 / s.speed) : forward(s.theta + k.beta), speedDot), scale(right(s.motion), s.speed * chiDot));
  const acceleration = add(add(scale(kAcceleration, 1 - blend), scale(dynamicAcceleration, blend)), gameAcceleration);
  const rDot = (1 - blend) * kRDot + blend * dynamicRDot;
  const longAcceleration = limitLongAcceleration(p, (cf.fx * cos + cr.fx - power.resistance) / p.mass);
  const mechanicalEnergy = 0.5 * p.mass * s.speed ** 2 + 0.5 * d.inertia * s.r ** 2;
  const axle = (t: typeof front, c: typeof cf, transient: typeof tf, slip: number, alpha: number, surface: typeof sf) => ({ ...t, fx: c.fx, fy: transient.force, quasiStaticForce: c.fy, slipVelocity: slip, alpha, lateralCap: c.lateralCap,
    utilization: (t.capX > 0 ? (c.fx / t.capX) ** 2 : 0) + (t.capY > 0 ? (transient.force / t.capY) ** 2 : 0), surface, tau: transient.tau, memoryProjection: transient.memoryProjection, power: transient.power });
  return { acceleration, rDot, deltaDot, hDot, tires: { front: tf.force * blend, rear: tr.force * blend }, longAcceleration,
    assist: options.fixedSteering === undefined ? assist.history : s.assist,
    observation: { modelVersion: p.modelVersion, profileId: p.profileId, profileRevision: p.profileRevision,
      speed: s.speed, motion: s.motion, theta: s.theta, beta: s.beta, u: s.u, v: s.v, r: s.r, delta: s.delta, h: s.h,
      geometry: g, loads, front: axle(front, cf, tf, slipF, alphaF, sf), rear: axle(rear, cr, tr, vr, alphaR, sr),
      route: assist, deltaTarget: target, targetSpeed: power.target, input: { ...input }, blend, power,
      physicalForce: { x: fx, y: fy }, yawMoment: moment, physicalLongAcceleration: longAcceleration,
      game, energy: { mechanical: mechanicalEnergy, tireStored: 0, total: mechanicalEnergy, ...s.energy }, protection: { ...s.protection }, loadIntervention },
  };
}
export type Observation = ReturnType<typeof evaluate>['observation'];
export function observe(s: VehicleState, p: VehicleProfile, input: Intent = { targetSpeed: s.speed, angle: null, drift: false }, options: StepOptions = {}): Observation {
  return evaluate(s, input, p, options.substep ?? RULES.substep, options).observation;
}
function candidate(s: VehicleState, e: ReturnType<typeof evaluate>, dt: number): VehicleState {
  return stateFrom({ ...s, position: add(s.position, scale(s.worldVelocity, dt)), worldVelocity: add(s.worldVelocity, scale(e.acceleration, dt)),
    theta: wrap(s.theta + s.r * dt), r: s.r + e.rDot * dt,
    delta: s.delta + e.deltaDot * dt, h: clamp(s.h + e.hDot * dt, 0, 1),
    tires: e.tires, previousLongAcceleration: e.longAcceleration, assist: e.assist, time: s.time + dt });
}
function integrate(s: VehicleState, input: Intent, p: VehicleProfile, dt: number, options: StepOptions): VehicleState {
  const a = evaluate(s, input, p, dt / 2, options, s, dt);
  const mid = candidate(s, a, dt / 2);
  const b = evaluate(mid, input, p, dt, options, s, dt, s, dt / 2);
  let next = candidate(s, { ...b, deltaDot: (advanceSteering(s.delta, b.observation.deltaTarget, mid.speed, p, dt) - s.delta) / dt,
    hDot: (approach(s.h, input.drift ? 1 : 0, input.drift ? p.drift.enterTime : p.drift.exitTime, 10, dt) - s.h) / dt }, dt);
  // RK2位置／姿态使用中点速度；前进保护只收缩旧态到候选的增量，不夹运动角。
  next = stateFrom({ ...next, position: add(s.position, scale(mid.worldVelocity, dt)), theta: wrap(s.theta + mid.r * dt) });
  // 有限停车先处理合法制动的过零候选；它不是极端侧滑/倒车保护。
  if (!options.coast && input.targetSpeed <= 0 && (dot(next.worldVelocity, s.worldVelocity) < 0 || next.speed < 1e-7)) next = stateFrom({ ...next, worldVelocity: { x: 0, y: 0 }, r: 0, tires: { front: 0, rear: 0 }, previousLongAcceleration: 0 });
  let strength = 0;
  if (next.speed > p.power.maxSpeed + 1e-10 || Math.abs(next.beta) >= RULES.hardSlip || next.u < -1e-12) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 32; i++) {
      const t = (lo + hi) / 2, velocity = add(s.worldVelocity, scale(add(next.worldVelocity, scale(s.worldVelocity, -1)), t));
      const theta = s.theta + wrap(next.theta - s.theta) * t;
      const good = norm(velocity) <= p.power.maxSpeed + 1e-10 && dot(velocity, forward(theta)) >= 0 && Math.abs(wrap(Math.atan2(velocity.y, velocity.x) - theta)) < RULES.hardSlip;
      if (good) lo = t; else hi = t;
    }
    strength = 1 - lo;
    next = stateFrom({ ...next, worldVelocity: add(s.worldVelocity, scale(add(next.worldVelocity, scale(s.worldVelocity, -1)), lo)), theta: wrap(s.theta + wrap(next.theta - s.theta) * lo), r: s.r + (next.r - s.r) * lo });
  }
  if (next.speed === 0) next = stateFrom({ ...next, r: 0, tires: { front: 0, rear: 0 } });
  const o = b.observation;
  const endFront = relaxTire(s.tires.front, o.front.quasiStaticForce, o.front.slipVelocity, o.front.lateralCap, p.tires.front.relaxation, mid.u, dt);
  const endRear = relaxTire(s.tires.rear, o.rear.quasiStaticForce, o.rear.slipVelocity, o.rear.lateralCap, p.tires.rear.relaxation, mid.u, dt);
  if (next.speed > 0) next = stateFrom({ ...next, tires: { front: endFront.force * o.blend, rear: endRear.force * o.blend } });
  return stateFrom({ ...next, protection: { count: s.protection.count + (strength > 1e-8 ? 1 : 0), strength: Math.max(s.protection.strength, strength), loadCount: s.protection.loadCount + (o.loadIntervention ? 1 : 0) },
    energy: { ...s.energy,
      driveWork: s.energy.driveWork + (o.front.fx * (mid.u * Math.cos(mid.delta) + (mid.v + derived(p).lf * mid.r) * Math.sin(mid.delta)) + o.rear.fx * mid.u) * dt,
      tireDissipation: s.energy.tireDissipation - (o.front.power + o.rear.power) * dt,
      rollingDissipation: s.energy.rollingDissipation + o.power.resistance * mid.speed * dt,
      gameDissipation: s.energy.gameDissipation + p.mass * o.game.deceleration * mid.speed * dt * (options.gameCost === false ? 0 : 1) } });
}
export function step(s: VehicleState, input: Intent, p: VehicleProfile, dt = RULES.outerStep, options: StepOptions = {}): VehicleState {
  if (!Number.isFinite(dt) || dt < 0 || Math.abs(dt / RULES.outerStep - Math.round(dt / RULES.outerStep)) > 1e-8) throw new Error('dt: 须为1/120秒的非负整数倍');
  if (!Number.isFinite(input.targetSpeed) || (input.angle !== null && !Number.isFinite(input.angle))) throw new Error('intent: 速度/方向必须有限');
  const substep = options.substep ?? RULES.substep;
  if (substep !== 1 / 240 && substep !== 1 / 480) throw new Error('substep: 只支持1/240或验证用1/480');
  if (dt === 0) return s;
  const targetRate = input.angle === null || s.assist.lastTarget === null ? 0 : clamp(angleError(input.angle, s.assist.lastTarget, s.assist.turnSign) / dt, -p.assist.maxRouteRate, p.assist.maxRouteRate);
  s = stateFrom({ ...s, assist: { ...s.assist, lastTarget: input.angle, targetRate: approach(s.assist.targetRate, targetRate, 0.08, 20, dt) } });
  for (let i = 0; i < Math.round(dt / substep); i++) s = integrate(s, input, p, substep, options);
  return s;
}
/** 验证一次配置后复用；消费者也可以使用无隐藏状态的函数式API。 */
export function createPhysics(profile: VehicleProfile) {
  const errors = validateProfile(profile); if (errors.length) throw new Error(errors.join('\n'));
  const p = structuredClone(profile);
  const freeze = (value: object): void => { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); Object.freeze(value); };
  freeze(p);
  return { profile: p, create: (initial?: InitialState) => createState(p, initial),
    step: (state: VehicleState, intent: Intent, dt = RULES.outerStep, options: StepOptions = {}) => step(state, intent, p, dt, options),
    observe: (state: VehicleState, intent?: Intent, options?: StepOptions) => observe(state, p, intent, options) };
}
