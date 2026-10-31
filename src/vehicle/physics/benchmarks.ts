/** v2基准：验收约束控制器行为，物理允许完整运动范围。 */
import {
  CONTROLLER_VERSION,
  derived,
  MODEL_VERSION,
  PROFILE_SCHEMA_VERSION,
  RULES,
} from "./config";
import type { VehicleProfile } from "./config";
import { createState } from "./state";
import type { Intent, VehicleState } from "./state";
import { observe, step } from "./dynamics";
import type { StepOptions } from "./dynamics";
import { mechanicalEnergy } from "./physical";
import { advanceSteering } from "./steering";
import { rad, wrap } from "./math";
import { SURFACES, SURFACE_VERSION } from "./surfaces";
export const BENCHMARK_VERSION = "vehicle-benchmark-2";
export const INPUT_VERSION = "vehicle-input-2";
export function tracePoint(
  s: VehicleState,
  p: VehicleProfile,
  input: Intent,
  options: StepOptions = {},
) {
  const o = observe(s, p, input, options);
  const axle = (t: typeof o.front) => ({
    alpha: t.alpha,
    load: t.load,
    fx: t.fx,
    fy: t.fy,
    capX: t.capX,
    capY: t.capY,
    utilization: t.utilization,
    surfaceId: t.surface.surfaceId,
    longSlip: t.longSlip,
    slipVelocity: t.slipVelocity,
  });
  return {
    time: s.time,
    position: s.position,
    speed: s.speed,
    theta: s.theta,
    motion: s.motion,
    beta: s.beta,
    r: s.r,
    delta: s.delta,
    wheelSpeeds: s.wheelSpeeds,
    betaRef: s.assist.betaRef,
    routeError: input.angle === null ? 0 : wrap(input.angle - s.motion),
    command: o.command,
    steeringLimit: o.route.steeringLimit,
    saturated: o.route.saturated,
    h: s.h,
    axles: { front: axle(o.front), rear: axle(o.rear) },
    energy: { mechanical: o.energy.mechanical, ...s.energy },
  };
}
export type TracePoint = ReturnType<typeof tracePoint>;
export function normalMatrix(p: VehicleProfile, options: StepOptions = {}) {
  return (["hard", "loose", "wet"] as const).flatMap((family) =>
    [0.2, 0.5, 1].flatMap((fraction) =>
      ["side", "behind", "switch"].map((scenario) => {
        const speed = p.power.maxSpeed * fraction,
          opt = {
            ...options,
            surface: options.surface ?? (() => SURFACES[family]),
          };
        let s = createState(p, { worldVelocity: { x: speed, y: 0 } }),
          peakSlip = 0,
          peakYaw = 0,
          maxSpeedError = 0,
          saturatedSteps = 0;
        const trace: TracePoint[] = [];
        for (let i = 0; i < 720; i++) {
          const angle =
            scenario === "behind"
              ? Math.PI
              : scenario === "side"
                ? Math.PI / 2
                : (Math.floor(i / 60) % 2 ? 1 : -1) * rad(120);
          const intent = { targetSpeed: speed, angle, drift: false };
          s = step(s, intent, p, 1 / 120, opt);
          if (s.speed > 0.3) peakSlip = Math.max(peakSlip, Math.abs(s.beta));
          peakYaw = Math.max(peakYaw, Math.abs(s.r));
          maxSpeedError = Math.max(maxSpeedError, Math.abs(s.speed - speed));
          if (i % 12 === 0) {
            const point = tracePoint(s, p, intent, opt);
            trace.push(point);
            if (point.saturated) saturatedSteps++;
          }
        }
        return {
          family,
          fraction,
          scenario,
          peakSlip,
          peakYaw,
          maxSpeedError,
          saturatedSamples: saturatedSteps,
          passed:
            Number.isFinite(s.speed + s.theta + s.r) && peakSlip < rad(45),
          residual: trace.at(-1)!,
          trace,
        };
      }),
    ),
  );
}
export function recoveryMatrix(p: VehicleProfile, options: StepOptions = {}) {
  return [1, -1].map((sign) => {
    const speed = p.power.maxSpeed * 0.55,
      initial = createState(p, {
        worldVelocity: {
          x: speed * Math.cos(rad(95)),
          y: sign * speed * Math.sin(rad(95)),
        },
        r: -sign * 3,
      });
    const intent = { targetSpeed: speed, angle: 0, drift: false };
    let s = step(initial, intent, p, 1 / 120, options);
    const first = tracePoint(s, p, intent, options),
      trace = [first];
    const velocityJump = Math.hypot(
      s.worldVelocity.x - initial.worldVelocity.x,
      s.worldVelocity.y - initial.worldVelocity.y,
    );
    for (let i = 1; i < 720; i++) {
      s = step(s, intent, p, 1 / 120, options);
      if (i % 12 === 0) trace.push(tracePoint(s, p, intent, options));
    }
    return {
      sign,
      first,
      velocityJump,
      passed:
        Math.abs(first.beta) > rad(80) &&
        Math.abs(first.r) > 2 &&
        velocityJump < 0.3 &&
        Number.isFinite(s.speed + s.theta + s.r),
      residual: trace.at(-1)!,
      trace,
    };
  });
}
export function driftBenchmark(
  p: VehicleProfile,
  sign = 1,
  options: StepOptions = {},
  rate = 1.2,
  fraction = 8 / p.power.maxSpeed,
) {
  const speed = fraction * p.power.maxSpeed;
  let s = createState(p, { worldVelocity: { x: speed, y: 0 } }),
    longest = 0,
    consecutive = 0,
    peakBeta = 0,
    minSpeed = speed,
    exitDelta = 0;
  const trace: TracePoint[] = [];
  for (let i = 0; i < 1080; i++) {
    const input = {
      targetSpeed: speed,
      angle: ((sign * Math.min(i + 1, 720)) / 120) * rate,
      drift: i < 720,
    };
    const before = s;
    s = step(s, input, p, 1 / 120, options);
    if (i < 720) {
      peakBeta = Math.max(peakBeta, Math.abs(s.beta));
      minSpeed = Math.min(minSpeed, s.speed);
      consecutive = sign * s.beta < -rad(5) ? consecutive + 1 : 0;
      longest = Math.max(longest, consecutive);
    }
    if (i === 720) exitDelta = Math.abs(s.beta - before.beta);
    if (i % 12 === 0) trace.push(tracePoint(s, p, input, options));
  }
  const final = tracePoint(
    s,
    p,
    { targetSpeed: speed, angle: sign * 6 * rate, drift: false },
    options,
  );
  return {
    passed: longest >= 120 && exitDelta < rad(5) && Math.abs(s.beta) < rad(2),
    duration: longest / 120,
    peakBeta,
    minSpeedRatio: minSpeed / speed,
    exitDelta,
    final,
    trace,
  };
}
export function replayInput(t: number, p: VehicleProfile): Intent {
  return {
    targetSpeed: t < 8 ? p.power.maxSpeed * 0.55 : 0,
    angle: t < 2 ? 0 : t < 4 ? 0.45 : t < 7 ? -0.3 : null,
    drift: t >= 3 && t < 6,
  };
}
export function replay(
  p: VehicleProfile,
  fps = 120,
  seconds = 10,
  substep = 1 / 240,
) {
  let s = createState(p),
    stepIndex = 0;
  for (let frame = 1; frame <= Math.round(seconds * fps); frame++) {
    const targetSteps = Math.round((frame * 120) / fps);
    while (stepIndex < targetSteps) {
      s = step(s, replayInput(stepIndex / 120, p), p, 1 / 120, { substep });
      stepIndex++;
    }
  }
  return s;
}
export function numericalReport(p: VehicleProfile) {
  const states = [30, 60, 120].map((fps) => ({ fps, state: replay(p, fps) })),
    base = states[2].state;
  const frameDifferences = states.map(({ fps, state: s }) => ({
    fps,
    position: Math.hypot(
      s.position.x - base.position.x,
      s.position.y - base.position.y,
    ),
    speed: Math.abs(s.speed - base.speed),
    heading: Math.abs(s.theta - base.theta),
    yaw: Math.abs(s.r - base.r),
  }));
  const coarse = replay(p, 120, 5),
    fine = replay(p, 120, 5, 1 / 480);
  const convergence = {
    position: Math.hypot(
      coarse.position.x - fine.position.x,
      coarse.position.y - fine.position.y,
    ),
    heading: Math.abs(wrap(coarse.theta - fine.theta)),
  };
  return {
    passed:
      frameDifferences.every(
        (x) =>
          x.position === 0 && x.speed === 0 && x.heading === 0 && x.yaw === 0,
      ) &&
      convergence.position < derived(p).bodyLength * 0.05 &&
      convergence.heading < rad(2),
    frameDifferences,
    convergence,
  };
}
export function energyReport(p: VehicleProfile) {
  const cases = [
    { name: "lateral84", beta: 84, r: -2 },
    { name: "lateral95", beta: 95, r: -2 },
    { name: "backward170", beta: 170, r: 1 },
    { name: "rotation", beta: 0, r: 3 },
  ];
  const variants = cases.map((c) => {
    const speed = c.name === "rotation" ? 0 : p.power.maxSpeed * 0.6;
    let s = createState(p, {
      worldVelocity: {
        x: speed * Math.cos(rad(c.beta)),
        y: speed * Math.sin(rad(c.beta)),
      },
      r: c.r,
    });
    const initial = mechanicalEnergy(s, p);
    let previous = initial,
      maxStepGain = 0;
    for (let i = 0; i < 600; i++) {
      s = step(s, { targetSpeed: 0, angle: null, drift: false }, p, 1 / 120, {
        actuation: {
          steeringTarget: i < 300 ? 0.15 : -0.1,
          drive: 0,
          brake: i > 400 ? 0.3 : 0,
          rearBrake: 0,
        },
      });
      const e = mechanicalEnergy(s, p);
      maxStepGain = Math.max(maxStepGain, e - previous);
      previous = e;
    }
    const e = s.energy,
      budgetResidual =
        previous -
        initial -
        e.driveWork +
        e.tireDissipation +
        e.rollingDissipation +
        e.brakeDissipation;
    return {
      name: c.name,
      initial,
      final: previous,
      maxStepGain,
      budgetResidual,
      ledger: e,
      passed:
        previous < initial &&
        maxStepGain < 1e-8 &&
        Math.abs(budgetResidual) < 1e-7 &&
        e.tireDissipation >= 0 &&
        e.brakeDissipation >= -1e-9,
    };
  });
  return { passed: variants.every((x) => x.passed), variants };
}
export function profileSnapshot(p: VehicleProfile) {
  return {
    modelVersion: MODEL_VERSION,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: p.profileId,
    profileRevision: p.profileRevision,
    surfaceVersion: SURFACE_VERSION,
    controllerVersion: CONTROLLER_VERSION,
    benchmarkVersion: BENCHMARK_VERSION,
    inputVersion: INPUT_VERSION,
    parameters: structuredClone(p),
    rules: structuredClone(RULES),
    surfaces: SURFACES,
    derived: derived(p),
  };
}
export function diagnostic(p: VehicleProfile) {
  return {
    profile: p.profileId,
    normal: normalMatrix(p).map(({ trace, ...x }) => x),
    recovery: recoveryMatrix(p).map(({ trace, ...x }) => x),
    drift: driftBenchmark(p),
  };
}
export type AssistanceMode = "none" | "common" | "final";
export const PUBLIC_SPEED_FRACTION = 0.35;
export function publicSpeed(a: VehicleProfile, b: VehicleProfile) {
  return PUBLIC_SPEED_FRACTION * Math.min(a.power.maxSpeed, b.power.maxSpeed);
}
export function relativeDifference(a: number, b: number, epsilon = 1e-6) {
  return !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    Math.min(Math.abs(a), Math.abs(b)) < epsilon
    ? null
    : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
}
export type MetricFamily =
  | "power"
  | "braking"
  | "geometry"
  | "steering"
  | "stability"
  | "drift"
  | "surface";
export interface Metric {
  family: MetricFamily;
  name: string;
  value: number;
  unit: string;
}
export const METRIC_FLOORS: Record<string, number> = {
  accelerationTime: 0.01,
  brakingDistance: 0.01,
  lowSpeedRadius: 0.01,
  response10to90: 0.01,
  actuator10to90: 0.01,
  headingOvershoot: rad(0.25),
  driftPeakBeta: rad(1),
  looseRouteError: rad(0.5),
};
export function qualifyingFamilies(a: Metric[], b: Metric[]): MetricFamily[] {
  return [
    ...new Set(
      a
        .filter((x) => {
          const y = b.find((y) => y.name === x.name && y.family === x.family),
            d = y
              ? relativeDifference(
                  x.value,
                  y.value,
                  METRIC_FLOORS[x.name] ?? 1e-6,
                )
              : null;
          return d !== null && d >= 0.15;
        })
        .map((x) => x.family),
    ),
  ];
}
export function withAssistance(
  p: VehicleProfile,
  mode: AssistanceMode,
  common: VehicleProfile,
): VehicleProfile {
  return mode === "common" ? { ...p, assist: { ...common.assist } } : p;
}
export function circleCalibration(
  p: VehicleProfile,
  speed: number,
  delta = rad(3),
  options: StepOptions = {},
) {
  let s = createState(p, { worldVelocity: { x: speed, y: 0 }, delta });
  for (let i = 0; i < 600; i++)
    s = step(s, { targetSpeed: speed, angle: 0, drift: false }, p, 1 / 120, {
      ...options,
      fixedSteering: delta,
    });
  return {
    radius: Math.abs(s.speed / s.r),
    yawRate: s.r,
    beta: s.beta,
    understeer:
      delta - Math.atan((p.geometry.wheelbase * s.r) / Math.max(s.u, 0.01)),
  };
}
export function assistedCircleCalibration(
  p: VehicleProfile,
  speed: number,
  routeRate = 0.4,
) {
  let s = createState(p, { worldVelocity: { x: speed, y: 0 } });
  for (let i = 0; i < 600; i++)
    s = step(
      s,
      { targetSpeed: speed, angle: ((i + 1) / 120) * routeRate, drift: false },
      p,
    );
  return {
    radius: Math.abs(s.speed / s.r),
    yawRate: s.r,
    beta: s.beta,
    actualSteering: s.delta,
    routeError: wrap(5 * routeRate - s.motion),
  };
}
export function metrics(
  p: VehicleProfile,
  speed: number,
  mode: AssistanceMode = "final",
  common = p,
) {
  p = withAssistance(p, mode, common);
  const options: StepOptions = mode === "none" ? { fixedSteering: 0 } : {};
  let s = createState(p),
    accelerationTime: number | null = null;
  for (let i = 0; i < 2400; i++) {
    s = step(
      s,
      { targetSpeed: speed, angle: 0, drift: false },
      p,
      1 / 120,
      options,
    );
    if (s.speed >= speed * 0.99) {
      accelerationTime = s.time;
      break;
    }
  }
  let brake = createState(p, { worldVelocity: { x: speed, y: 0 } });
  for (let i = 0; i < 2400 && brake.speed > 1e-4; i++)
    brake = step(
      brake,
      { targetSpeed: 0, angle: null, drift: false },
      p,
      1 / 120,
      options,
    );
  let turn = createState(p, { worldVelocity: { x: speed, y: 0 } }),
    t10: number | null = null,
    t90: number | null = null,
    maxHeading = 0;
  for (let i = 0; i < 480; i++) {
    turn = step(
      turn,
      { targetSpeed: speed, angle: rad(30), drift: false },
      p,
      1 / 120,
      mode === "none" ? { fixedSteering: rad(6) } : {},
    );
    if (t10 === null && turn.theta >= rad(3)) t10 = turn.time;
    if (t90 === null && turn.theta >= rad(27)) t90 = turn.time;
    maxHeading = Math.max(maxHeading, turn.theta);
  }
  const drift = driftBenchmark(p, 1, options, 1.2, speed / p.power.maxSpeed),
    surfaceResults = (["hard", "loose", "wet"] as const).map((family) => {
      let q = createState(p, { worldVelocity: { x: speed, y: 0 } }),
        error = 0,
        ratio = 0;
      for (let i = 0; i < 360; i++) {
        const angle = (i / 120) * 0.7;
        q = step(q, { targetSpeed: speed, angle, drift: false }, p, 1 / 120, {
          ...options,
          surface: () => SURFACES[family],
        });
        if (i >= 120) {
          error += Math.abs(wrap(angle - q.motion));
          ratio += q.speed / speed;
        }
      }
      return { family, routeError: error / 240, speedRatio: ratio / 240 };
    });
  let actuator = 0,
    actuator10 = 0,
    actuator90 = 0;
  for (let i = 1; i <= 480; i++) {
    actuator = advanceSteering(actuator, rad(10), speed, p, 1 / 240);
    if (!actuator10 && actuator >= rad(1)) actuator10 = i / 240;
    if (!actuator90 && actuator >= rad(9)) actuator90 = i / 240;
  }
  const values: Metric[] = [
    {
      family: "power",
      name: "accelerationTime",
      value: accelerationTime ?? 20,
      unit: "s",
    },
    {
      family: "braking",
      name: "brakingDistance",
      value: brake.position.x,
      unit: "L",
    },
    {
      family: "geometry",
      name: "lowSpeedRadius",
      value: p.geometry.wheelbase / Math.tan(rad(20)),
      unit: "L",
    },
    {
      family: "steering",
      name: "response10to90",
      value: t10 !== null && t90 !== null ? t90 - t10 : 4,
      unit: "s",
    },
    {
      family: "steering",
      name: "actuator10to90",
      value: actuator90 - actuator10,
      unit: "s",
    },
    {
      family: "stability",
      name: "headingOvershoot",
      value: mode === "none" ? 0 : Math.max(0, maxHeading - rad(30)),
      unit: "rad",
    },
    {
      family: "drift",
      name: "driftPeakBeta",
      value: drift.peakBeta,
      unit: "rad",
    },
    {
      family: "surface",
      name: "looseRouteError",
      value: surfaceResults[1].routeError,
      unit: "rad",
    },
  ];
  return {
    speed,
    mode,
    values,
    circle: circleCalibration(p, speed),
    accelerationReached: accelerationTime !== null,
    stoppingCompleted: brake.speed < 1e-4,
    brakingTime: brake.time,
    drift: { ...drift, trace: undefined },
    surfaceResults,
  };
}
