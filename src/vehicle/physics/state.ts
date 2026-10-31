import type { PhysicalProfile, VehicleProfile } from "./config";
import type { Vec2 } from "./math";
import { dot, forward, norm, right, wrap } from "./math";
export interface Intent {
  targetSpeed: number;
  angle: number | null;
  drift: boolean;
}
export const IDLE: Intent = { targetSpeed: 0, angle: null, drift: false };
export interface Actuation {
  steeringTarget: number;
  drive: number;
  brake: number;
  rearBrake: number;
}
export interface TireHistory {
  front: number;
  rear: number;
}
export interface AssistHistory {
  betaRef: number;
  routeRate: number;
  turnSign: number;
  lastTarget: number | null;
  targetRate: number;
  driftBlend: number;
}
export interface EnergyLedger {
  tireDissipation: number;
  rollingDissipation: number;
  driveWork: number;
  brakeDissipation: number;
  collisionDissipation: number;
  numericalResidual: number;
}
export interface PhysicalData {
  position: Vec2;
  worldVelocity: Vec2;
  theta: number;
  r: number;
  delta: number;
  wheelSpeeds: TireHistory;
  longitudinalForces: TireHistory;
  tires: TireHistory;
  previousLongAcceleration: number;
  energy: EnergyLedger;
  time: number;
}
export interface PhysicalState extends Readonly<PhysicalData> {
  readonly speed: number;
  readonly motion: number;
  readonly beta: number;
  readonly u: number;
  readonly v: number;
}
export interface AuthoritativeState extends PhysicalData {
  assist: AssistHistory;
}
export interface VehicleState
  extends PhysicalState,
    Readonly<AuthoritativeState> {
  readonly h: number;
}
export interface InitialState {
  position?: Vec2;
  worldVelocity?: Vec2;
  theta?: number;
  r?: number;
  delta?: number;
  h?: number;
  wheelSpeeds?: TireHistory;
  longitudinalForces?: TireHistory;
  tires?: TireHistory;
  previousLongAcceleration?: number;
  assist?: Partial<AssistHistory>;
  time?: number;
  energy?: EnergyLedger;
}
export const emptyEnergy = (): EnergyLedger => ({
  tireDissipation: 0,
  rollingDissipation: 0,
  driveWork: 0,
  brakeDissipation: 0,
  collisionDissipation: 0,
  numericalResidual: 0,
});
export function physicalFrom(data: PhysicalData): PhysicalState {
  const { theta, r, delta, previousLongAcceleration, time } = data;
  const result: PhysicalState = {
    theta,
    r,
    delta,
    previousLongAcceleration,
    time,
    position: Object.freeze({ ...data.position }),
    worldVelocity: Object.freeze({ ...data.worldVelocity }),
    wheelSpeeds: Object.freeze({ ...data.wheelSpeeds }),
    tires: Object.freeze({ ...data.tires }),
    longitudinalForces: Object.freeze({ ...data.longitudinalForces }),
    energy: Object.freeze({ ...data.energy }),
    get speed() {
      return norm(this.worldVelocity);
    },
    get motion() {
      return this.speed === 0
        ? this.theta
        : Math.atan2(this.worldVelocity.y, this.worldVelocity.x);
    },
    get beta() {
      return this.speed === 0 ? 0 : wrap(this.motion - this.theta);
    },
    get u() {
      return dot(this.worldVelocity, forward(this.theta));
    },
    get v() {
      return dot(this.worldVelocity, right(this.theta));
    },
  };
  return Object.freeze(result);
}
export function stateFrom(data: AuthoritativeState): VehicleState {
  const physical = physicalFrom(data);
  const result: VehicleState = {
    ...physical,
    assist: Object.freeze({ ...data.assist }),
    get speed() {
      return norm(this.worldVelocity);
    },
    get motion() {
      return this.speed === 0
        ? this.theta
        : Math.atan2(this.worldVelocity.y, this.worldVelocity.x);
    },
    get beta() {
      return this.speed === 0 ? 0 : wrap(this.motion - this.theta);
    },
    get u() {
      return dot(this.worldVelocity, forward(this.theta));
    },
    get v() {
      return dot(this.worldVelocity, right(this.theta));
    },
    get h() {
      return this.assist.driftBlend;
    },
  };
  return Object.freeze(result);
}
export function createState(
  profile: PhysicalProfile,
  initial: InitialState = {},
): VehicleState {
  const allowed = [
    "position",
    "worldVelocity",
    "theta",
    "r",
    "delta",
    "h",
    "wheelSpeeds",
    "longitudinalForces",
    "tires",
    "previousLongAcceleration",
    "assist",
    "time",
    "energy",
  ];
  for (const k of Object.keys(initial))
    if (!allowed.includes(k)) throw new Error(`initial.${k}: 非权威字段`);
  const velocity = initial.worldVelocity ?? { x: 0, y: 0 },
    theta = initial.theta ?? 0,
    r = initial.r ?? 0;
  const u = dot(velocity, forward(theta)),
    v = dot(velocity, right(theta));
  const d = profile.geometry,
    lf = d.wheelbase * (1 - d.cgFromRear),
    delta = initial.delta ?? 0;
  if (
    initial.h !== undefined &&
    initial.assist?.driftBlend !== undefined &&
    initial.h !== initial.assist.driftBlend
  )
    throw new Error("initial.h/assist.driftBlend: 重复来源矛盾");
  const data: AuthoritativeState = {
    position: initial.position ?? { x: 0, y: 0 },
    worldVelocity: velocity,
    theta,
    r,
    delta,
    wheelSpeeds: initial.wheelSpeeds ?? {
      front:
        (u * Math.cos(delta) + (v + lf * r) * Math.sin(delta)) /
        profile.wheels.radius,
      rear: u / profile.wheels.radius,
    },
    longitudinalForces: initial.longitudinalForces ?? { front: 0, rear: 0 },
    tires: initial.tires ?? { front: 0, rear: 0 },
    previousLongAcceleration: initial.previousLongAcceleration ?? 0,
    time: initial.time ?? 0,
    energy: initial.energy ?? emptyEnergy(),
    assist: {
      betaRef: 0,
      routeRate: 0,
      turnSign: 1,
      lastTarget: null,
      targetRate: 0,
      driftBlend: initial.h ?? 0,
      ...initial.assist,
    },
  };
  function finite(o: object, path: string): void {
    for (const [k, value] of Object.entries(o)) {
      if (value && typeof value === "object") finite(value, `${path}.${k}`);
      else if (typeof value === "number" && !Number.isFinite(value))
        throw new Error(`${path}.${k}: 非有限`);
    }
  }
  finite(data, "initial");
  for (const [k, value] of Object.entries({
    x: data.position.x,
    y: data.position.y,
    vx: velocity.x,
    vy: velocity.y,
    r,
    theta,
    delta,
    front: data.wheelSpeeds.front,
    rear: data.wheelSpeeds.rear,
  }))
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`initial.${k}: 缺失或非有限`);
  const checkShape = (
    value: unknown,
    template: unknown,
    path: string,
  ): void => {
    if (typeof template === "number") {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`${path}: 缺失或非有限`);
    } else if (template === null) {
      if (
        value !== null &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        throw new Error(`${path}: 目标角非法`);
    } else if (template && typeof template === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${path}: 缺失对象`);
      for (const [key, item] of Object.entries(template))
        checkShape(
          (value as Record<string, unknown>)[key],
          item,
          `${path}.${key}`,
        );
      for (const key of Object.keys(value))
        if (!(key in template)) throw new Error(`${path}.${key}: 未知字段`);
    }
  };
  checkShape(data.position, { x: 0, y: 0 }, "initial.position");
  checkShape(data.worldVelocity, { x: 0, y: 0 }, "initial.worldVelocity");
  checkShape(data.time, 0, "initial.time");
  checkShape(
    data.previousLongAcceleration,
    0,
    "initial.previousLongAcceleration",
  );
  checkShape(data.energy, emptyEnergy(), "initial.energy");
  for (const key of ["wheelSpeeds", "longitudinalForces", "tires"] as const)
    checkShape(data[key], { front: 0, rear: 0 }, `initial.${key}`);
  checkShape(
    data.assist,
    {
      betaRef: 0,
      routeRate: 0,
      turnSign: 1,
      lastTarget: null,
      targetRate: 0,
      driftBlend: 0,
    },
    "initial.assist",
  );
  if (data.time < 0) throw new Error("initial.time: 时间不能为负");
  if (
    Math.abs(delta) > profile.steering.maxAngle ||
    Math.abs(r) > 10000 ||
    data.assist.driftBlend < 0 ||
    data.assist.driftBlend > 1
  )
    throw new Error("initial: 超出机械或数值范围");
  return stateFrom(data);
}
export function createPhysicalState(
  p: PhysicalProfile,
  initial: Partial<PhysicalData> = {},
): PhysicalState {
  const s = createState(p, initial);
  const {
    position,
    worldVelocity,
    theta,
    r,
    delta,
    wheelSpeeds,
    longitudinalForces,
    tires,
    previousLongAcceleration,
    time,
    energy,
  } = s;
  return physicalFrom({
    position,
    worldVelocity,
    theta,
    r,
    delta,
    wheelSpeeds,
    longitudinalForces,
    tires,
    previousLongAcceleration,
    time,
    energy,
  });
}
export const resetState = (
  p: VehicleProfile,
  position: Vec2 = { x: 0, y: 0 },
  theta = 0,
) => createState(p, { position, theta });
/** 仅显式生命周期重置使用，接触求解不调用此函数。 */
export const collisionStop = (
  p: VehicleProfile,
  s: VehicleState,
  position = s.position,
  theta = s.theta,
) => createState(p, { position, theta });
