import { CONTROLLER_VERSION, derived, MODEL_VERSION, PROFILE_SCHEMA_VERSION, RULES } from './config';
import type { VehicleProfile } from './config';
import { createState } from './state';
import type { Intent, VehicleState } from './state';
import { observe, step } from './dynamics';
import type { StepOptions } from './dynamics';
import { deg, rad, wrap } from './math';
import { SURFACES, SURFACE_VERSION } from './surfaces';

export const BENCHMARK_VERSION = 'vehicle-benchmark-1';
export const INPUT_VERSION = 'vehicle-input-1';
export const PUBLIC_SPEED_FRACTION = 0.35;
export const METRIC_FAMILIES = ['power', 'braking', 'geometry', 'steering', 'stability', 'drift', 'surface'] as const;
export type MetricFamily = typeof METRIC_FAMILIES[number];
export interface TracePoint { time: number; speed: number; theta: number; motion: number; beta: number; r: number; delta: number; betaRef: number; routeError: number; hardProtection: number;
  position: { x: number; y: number }; deltaTarget: number; h: number; targetAngle: number | null;
  axles: { front: AxleTrace; rear: AxleTrace }; energy: { mechanical: number; tireStored: number; tireDissipation: number; gameDissipation: number };
}
interface AxleTrace { alpha: number; load: number; fx: number; fy: number; capX: number; capY: number; utilization: number; surfaceId: string }
export interface StabilityResult {
  passed: boolean; settledAt: number | null; counterAt: number | null; minSpeedRatio: number;
  maxHeadingError: number; peakSlip: number; protection: number; residual: TracePoint; trace: TracePoint[];
}
export function tracePoint(s: VehicleState, p: VehicleProfile, input: Intent, options: StepOptions = {}): TracePoint {
  const o = observe(s, p, input, options);
  const axle = (t: typeof o.front): AxleTrace => ({ alpha: t.alpha, load: t.load, fx: t.fx, fy: t.fy, capX: t.capX, capY: t.capY, utilization: t.utilization, surfaceId: t.surface.surfaceId });
  return { time: s.time, speed: s.speed, theta: s.theta, motion: s.motion, beta: s.beta, r: s.r, delta: s.delta,
    betaRef: s.assist.betaRef, routeError: input.angle === null ? 0 : wrap(input.angle - s.motion), hardProtection: o.protection.count,
    position: s.position, deltaTarget: o.deltaTarget, h: s.h, targetAngle: input.angle, axles: { front: axle(o.front), rear: axle(o.rear) },
    energy: { mechanical: o.energy.mechanical, tireStored: o.energy.tireStored, tireDissipation: o.energy.tireDissipation, gameDissipation: o.energy.gameDissipation } };
}
function stability(s: VehicleState, p: VehicleProfile, input: Intent, window: number, recoverySign: number, options: StepOptions): StabilityResult {
  let consecutive = 0, settledAt: number | null = null, counterAt: number | null = null;
  let minSpeedRatio = 1, maxHeadingError = 0, peakSlip = 0;
  const trace: TracePoint[] = [], angular = rad(recoverySign ? 3 : 2), yaw = rad(recoverySign ? 4 : 3), steer = rad(recoverySign ? 4 : 3);
  for (let i = 0; i < Math.round((window + 1.1) * 120); i++) {
    s = step(s, input, p, 1 / 120, options);
    const target = input.angle ?? s.theta, ratio = s.speed / input.targetSpeed;
    const headingError = Math.abs(wrap(target - s.theta)), routeError = Math.abs(wrap(target - s.motion));
    maxHeadingError = Math.max(maxHeadingError, headingError); peakSlip = Math.max(peakSlip, Math.abs(s.beta));
    if (recoverySign && counterAt === null && s.delta * recoverySign <= -rad(2)) counterAt = s.time;
    const within = headingError <= angular && routeError <= angular && Math.abs(s.r) <= yaw && Math.abs(s.delta) <= steer && ratio >= (recoverySign ? 0.6 : 0.8);
    consecutive = within ? consecutive + 1 : 0;
    if (consecutive >= 120 && settledAt === null) { settledAt = s.time - 119 / 120; minSpeedRatio = ratio; }
    if (consecutive > 0) minSpeedRatio = Math.min(minSpeedRatio, ratio);
    if (i % 12 === 0) trace.push(tracePoint(s, p, input, options));
  }
  return { passed: settledAt !== null && settledAt <= window + 1e-8 && (!recoverySign || (counterAt !== null && counterAt <= 0.8)) && s.protection.count === 0 && s.protection.loadCount === 0,
    settledAt, counterAt, minSpeedRatio, maxHeadingError, peakSlip, protection: s.protection.count, residual: tracePoint(s, p, input, options), trace };
}
export function normalMatrix(p: VehicleProfile, options: StepOptions = {}) {
  return [0.25, 0.5, 0.75].flatMap(fraction => [15, 45, -15, -45].map(angle => ({ fraction, angle,
    ...stability(createState(p, { worldVelocity: { x: fraction * p.power.maxSpeed, y: 0 } }), p,
      { targetSpeed: fraction * p.power.maxSpeed, angle: rad(angle), drift: false }, p.acceptance.normalWindow, 0, options) })));
}
export function recoveryMatrix(p: VehicleProfile, options: StepOptions = {}) {
  return [1, -1].map(sign => {
    const a = p.acceptance, speed = a.recoverySpeed * p.power.maxSpeed;
    return { sign, ...stability(createState(p, { worldVelocity: { x: speed, y: 0 }, theta: sign * a.recoveryHeading, r: sign * a.recoveryYaw, delta: sign * a.recoverySteer, h: a.recoveryBlend }), p,
      { targetSpeed: speed, angle: 0, drift: false }, a.recoveryWindow, sign, options) };
  });
}
export function relativeDifference(a: number, b: number, epsilon = 1e-6): number | null {
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.min(Math.abs(a), Math.abs(b)) < epsilon ? null : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), epsilon);
}
export function publicSpeed(a: VehicleProfile, b: VehicleProfile): number { return PUBLIC_SPEED_FRACTION * Math.min(a.power.maxSpeed, b.power.maxSpeed); }
export interface Metric { family: MetricFamily; name: string; value: number; unit: string }
export const METRIC_FLOORS: Record<string, number> = { accelerationTime: 0.01, brakingDistance: 0.01, lowSpeedRadius: 0.01, response10to90: 0.01, headingOvershoot: rad(0.25), driftPeakBeta: rad(1), looseRouteError: rad(0.5) };
export function qualifyingFamilies(a: Metric[], b: Metric[]): MetricFamily[] {
  return [...new Set(a.filter(x => { const y = b.find(y => y.name === x.name && y.family === x.family); const delta = y ? relativeDifference(x.value, y.value, METRIC_FLOORS[x.name] ?? 1e-6) : null; return delta !== null && delta >= 0.15; }).map(x => x.family))];
}
/** 无辅助、公共辅助、最终辅助分别运行；不以最终辅助掩盖物理差异。 */
export type AssistanceMode = 'none' | 'common' | 'final';
export function withAssistance(p: VehicleProfile, mode: AssistanceMode, common: VehicleProfile): VehicleProfile {
  return mode === 'common' ? { ...p, assist: { ...common.assist } } : p;
}
export function circleCalibration(p: VehicleProfile, speed: number, delta = rad(3), options: StepOptions = {}) {
  let s = createState(p, { worldVelocity: { x: speed, y: 0 }, delta });
  const input = { targetSpeed: speed, angle: 0, drift: false };
  for (let i = 0; i < 600; i++) s = step(s, input, p, 1 / 120, { ...options, fixedSteering: delta, gameCost: false });
  return { radius: Math.abs(s.speed / s.r), yawRate: s.r, beta: s.beta,
    understeer: delta - Math.atan(p.geometry.wheelbase * s.r / Math.max(s.u, 0.01)), protection: s.protection.count };
}
export function assistedCircleCalibration(p: VehicleProfile, speed: number, routeRate = 0.4) {
  let s = createState(p, { worldVelocity: { x: speed, y: 0 } });
  for (let i = 0; i < 600; i++) s = step(s, { targetSpeed: speed, angle: (i + 1) / 120 * routeRate, drift: false }, p);
  return { radius: Math.abs(s.speed / s.r), yawRate: s.r, beta: s.beta, actualSteering: s.delta,
    routeError: wrap(5 * routeRate - s.motion), understeer: s.delta - Math.atan(p.geometry.wheelbase * s.r / Math.max(s.u, 0.01)), protection: s.protection.count };
}
export function profileSnapshot(p: VehicleProfile) {
  return { modelVersion: MODEL_VERSION, profileSchemaVersion: PROFILE_SCHEMA_VERSION, profileId: p.profileId,
    profileRevision: p.profileRevision, surfaceVersion: SURFACE_VERSION, controllerVersion: CONTROLLER_VERSION,
    benchmarkVersion: BENCHMARK_VERSION, inputVersion: INPUT_VERSION, parameters: structuredClone(p),
    rules: structuredClone(RULES),
    surfaces: SURFACES, derived: derived(p), boundary: '游戏原型、刚性单车身、前后等效轴；未执行网页接入或真实手机验收' };
}
export function diagnostic(p: VehicleProfile) {
  const normal = normalMatrix(p), recovery = recoveryMatrix(p);
  return { profile: p.profileId, normal: normal.map(({ trace, ...x }) => ({ ...x, residual: { theta: deg(x.residual.theta), motion: deg(x.residual.motion), r: deg(x.residual.r), delta: deg(x.residual.delta) } })),
    recovery: recovery.map(({ trace, ...x }) => ({ ...x, residual: { theta: deg(x.residual.theta), motion: deg(x.residual.motion), r: deg(x.residual.r), delta: deg(x.residual.delta) } })) };
}

export function driftBenchmark(p: VehicleProfile, sign = 1, options: StepOptions = {}, rate = 0.6, fraction = 0.55) {
  const speed = fraction * p.power.maxSpeed;
  let s = createState(p, { worldVelocity: { x: speed, y: 0 } }), targetAngle = 0, consecutive = 0, longest = 0;
  let peakBeta = 0, maxRouteError = 0, maxBetaError = 0, minSpeedRatio = 1;
  const trace: TracePoint[] = [];
  for (let i = 0; i < 1080; i++) {
    const t = i / 120;
    const demand = t < 0.5 ? t / 0.5 : t < 5 ? 1 : t < 7 ? (7 - t) / 2 : 0;
    targetAngle += sign * rate * demand / 120;
    const input = { targetSpeed: speed, angle: targetAngle, drift: t >= 0.5 && t < 6 };
    s = step(s, input, p, 1 / 120, options);
    const routeError = Math.abs(wrap(targetAngle - s.motion)), betaError = Math.abs(s.beta - s.assist.betaRef), ratio = s.speed / speed;
    if (t >= 2 && t < 5) {
      peakBeta = Math.max(peakBeta, Math.abs(s.beta)); maxRouteError = Math.max(maxRouteError, routeError); maxBetaError = Math.max(maxBetaError, betaError); minSpeedRatio = Math.min(minSpeedRatio, ratio);
      consecutive = Math.abs(s.beta) >= rad(5) && routeError <= rad(10) && betaError <= rad(8) && ratio >= 0.6 ? consecutive + 1 : 0;
      longest = Math.max(longest, consecutive);
    }
    if (i % 12 === 0) trace.push(tracePoint(s, p, input, options));
  }
  return { passed: longest >= 120 && s.protection.count === 0 && Math.abs(s.assist.betaRef) <= rad(1), duration: longest / 120, peakBeta, maxRouteError, maxBetaError, minSpeedRatio, protection: s.protection.count,
    final: tracePoint(s, p, { targetSpeed: speed, angle: targetAngle, drift: false }, options), trace };
}

export function metrics(p: VehicleProfile, speed: number, mode: AssistanceMode = 'final', common = p) {
  p = withAssistance(p, mode, common);
  const options: StepOptions = mode === 'none' ? { fixedSteering: 0 } : {};
  let s = createState(p), accelerationTime: number | null = null;
  const input = { targetSpeed: speed, angle: 0, drift: false };
  for (let i = 0; i < 2400; i++) {
    s = step(s, input, p, 1 / 120, options);
    if (s.speed >= speed * 0.999) { accelerationTime = s.time; break; }
  }
  let brake = createState(p, { worldVelocity: { x: speed, y: 0 } });
  for (let i = 0; i < 2400 && brake.speed > 0; i++) brake = step(brake, { ...input, targetSpeed: 0 }, p, 1 / 120, options);
  const circle = circleCalibration(p, speed);
  let turn = createState(p, { worldVelocity: { x: speed, y: 0 } }), time10: number | null = null, time90: number | null = null, maxHeading = 0;
  const turnOptions: StepOptions = mode === 'none' ? { fixedSteering: rad(6) } : {};
  const turnTarget = rad(30);
  const series: { time: number; theta: number; r: number }[] = [];
  for (let i = 0; i < 480; i++) { turn = step(turn, { ...input, angle: turnTarget }, p, 1 / 120, turnOptions); series.push({ time: turn.time, theta: turn.theta, r: turn.r }); maxHeading = Math.max(maxHeading, turn.theta); }
  const steadyYaw = series.at(-1)!.r;
  for (const point of series) {
    const value = mode === 'none' ? point.r : point.theta, target = mode === 'none' ? steadyYaw : turnTarget;
    if (time10 === null && value >= target * 0.1) time10 = point.time;
    if (time90 === null && value >= target * 0.9) time90 = point.time;
  }
  const drift = driftBenchmark(p, 1, options, 0.6, speed / p.power.maxSpeed);
  const surfaceResults = (['hard', 'loose', 'wet'] as const).map(family => {
    let q = createState(p, { worldVelocity: { x: speed, y: 0 } }); let error = 0, ratio = 0, utilization = 0;
    for (let i = 0; i < 360; i++) {
      const intent = { targetSpeed: speed, angle: i / 120 * 0.7, drift: false };
      const opt: StepOptions = { ...options, surface: () => SURFACES[family], ...(mode === 'none' ? { fixedSteering: rad(6) } : {}) };
      q = step(q, intent, p, 1 / 120, opt);
      if (i >= 120) { error += Math.abs(wrap(intent.angle - q.motion)); ratio += q.speed / speed; const o = observe(q, p, intent, opt); utilization += (o.front.utilization + o.rear.utilization) / 2; }
    }
    return { family, routeError: error / 240, speedRatio: ratio / 240, utilization: utilization / 240, protection: q.protection.count };
  });
  const values: Metric[] = [
    { family: 'power', name: 'accelerationTime', value: accelerationTime ?? 20, unit: 's' },
    { family: 'braking', name: 'brakingDistance', value: brake.position.x, unit: 'L' },
    { family: 'geometry', name: 'lowSpeedRadius', value: p.geometry.wheelbase / Math.tan(rad(20)), unit: 'L' },
    { family: 'steering', name: 'response10to90', value: time10 !== null && time90 !== null ? time90 - time10 : 4, unit: 's' },
    { family: 'stability', name: 'headingOvershoot', value: mode === 'none' ? 0 : Math.max(0, maxHeading - turnTarget), unit: 'rad' },
    { family: 'drift', name: 'driftPeakBeta', value: drift.peakBeta, unit: 'rad' },
    { family: 'surface', name: 'looseRouteError', value: surfaceResults.find(x => x.family === 'loose')!.routeError, unit: 'rad' },
  ];
  return { speed, mode, values, circle, brakingTime: brake.time, accelerationReached: accelerationTime !== null,
    stoppingCompleted: brake.speed === 0, drift: { ...drift, trace: undefined }, surfaceResults };
}

export function replayInput(t: number, p: VehicleProfile): Intent {
  return { targetSpeed: t < 8 ? p.power.maxSpeed * 0.55 : 0,
    angle: t < 2 ? 0 : t < 4 ? 0.45 : t < 7 ? -0.3 : null, drift: t >= 3 && t < 6 };
}
export function replay(p: VehicleProfile, fps = 120, seconds = 10, substep = 1 / 240) {
  let s = createState(p), stepIndex = 0;
  for (let frame = 1; frame <= Math.round(seconds * fps); frame++) {
    const targetSteps = Math.round(frame * 120 / fps);
    while (stepIndex < targetSteps) { s = step(s, replayInput(stepIndex / 120, p), p, 1 / 120, { substep }); stepIndex++; }
  }
  return s;
}
export function numericalReport(p: VehicleProfile) {
  const variants = [false, true].map(transient => {
    const q = structuredClone(p); if (transient) { q.tires.front.relaxation = 0.12; q.tires.rear.relaxation = 0.18; }
    const states = [30, 60, 120].map(fps => ({ fps, state: replay(q, fps) }));
    const base = states[2].state, length = derived(q).bodyLength;
    const frameDifferences = states.map(({ fps, state: s }) => ({ fps,
      position: Math.hypot(s.position.x - base.position.x, s.position.y - base.position.y), speed: Math.abs(s.speed - base.speed),
      heading: Math.abs(wrap(s.theta - base.theta)), motion: Math.abs(wrap(s.motion - base.motion)), delta: Math.abs(s.delta - base.delta), yaw: Math.abs(s.r - base.r) }));
    const coarse = replay(q, 120, 5), fine = replay(q, 120, 5, 1 / 480);
    const convergence = { position: Math.hypot(coarse.position.x - fine.position.x, coarse.position.y - fine.position.y), heading: Math.abs(wrap(coarse.theta - fine.theta)) };
    const framePassed = frameDifferences.every(x => x.position <= length * 0.01 && x.speed <= q.power.maxSpeed * 0.005 && x.heading <= rad(0.5) && x.motion <= rad(0.5) && x.delta <= rad(0.5) && x.yaw <= rad(0.5));
    return { transient, parameters: { frontSigma: q.tires.front.relaxation, rearSigma: q.tires.rear.relaxation }, frameDifferences, convergence,
      protection: states.map(x => x.state.protection), energy: states.map(x => observe(x.state, q).energy),
      passed: framePassed && convergence.position <= length * 0.05 && convergence.heading <= rad(2) && states.every(x => x.state.protection.count === 0 && x.state.protection.loadCount === 0) };
  });
  return { passed: variants.every(x => x.passed), variants };
}
export function energyReport(p: VehicleProfile) {
  const variants = [[0, 0], [0.12, 0], [0, 0.18], [0.12, 0.18]].map(([sigmaF, sigmaR]) => {
    const q = structuredClone(p); q.tires.front.relaxation = sigmaF; q.tires.rear.relaxation = sigmaR;
    const speed = q.power.maxSpeed * 0.55;
    let s = createState(q, { worldVelocity: { x: speed, y: speed * 0.1 }, r: 0.25, delta: 0.1 });
    const initial = observe(s, q).energy.total; let previous = initial, maxStepGain = 0, budgetExcess = 0, loadError = 0;
    for (let i = 0; i < 600; i++) {
      s = step(s, { targetSpeed: 0, angle: null, drift: false }, q, 1 / 120, { coast: true, fixedSteering: i < 150 ? -0.12 : i < 300 ? 0.12 : 0 });
      const o = observe(s, q); maxStepGain = Math.max(maxStepGain, o.energy.total - previous); previous = o.energy.total;
      budgetExcess = Math.max(budgetExcess, o.front.utilization - 1, o.rear.utilization - 1);
      loadError = Math.max(loadError, Math.abs(o.loads.front + o.loads.rear - q.mass * RULES.gravity));
    }
    return { sigmaF, sigmaR, initial, final: previous, maxStepGain, budgetExcess, loadError, protection: s.protection,
      ledger: s.energy, passed: previous < initial && maxStepGain <= initial * 1e-4 && budgetExcess < 1e-9 && loadError < 1e-9 };
  });
  return { passed: variants.every(x => x.passed), variants };
}
