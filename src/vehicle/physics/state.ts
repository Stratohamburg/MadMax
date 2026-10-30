import type { VehicleProfile } from './config';
import { RULES } from './config';
import type { Vec2 } from './math';
import { dot, forward, norm, right, wrap } from './math';

export interface Intent { targetSpeed: number; angle: number | null; drift: boolean }
export const IDLE: Intent = { targetSpeed: 0, angle: null, drift: false };
export interface TireHistory { front: number; rear: number }
export interface AssistHistory { betaRef: number; routeRate: number; turnSign: number; lastTarget: number | null; targetRate: number }
export interface Protection { count: number; strength: number; loadCount: number }
export interface EnergyLedger { tireDissipation: number; rollingDissipation: number; gameDissipation: number; projectionDissipation: number; driveWork: number }
export interface AuthoritativeState {
  position: Vec2; worldVelocity: Vec2; theta: number; r: number; delta: number; h: number;
  tires: TireHistory; previousLongAcceleration: number; assist: AssistHistory;
  protection: Protection; energy: EnergyLedger; time: number;
}
export interface VehicleState extends Readonly<AuthoritativeState> {
  readonly speed: number; readonly motion: number; readonly beta: number; readonly u: number; readonly v: number;
}
export interface InitialState {
  position?: Vec2; worldVelocity?: Vec2; theta?: number; r?: number; delta?: number; h?: number;
  tires?: TireHistory; previousLongAcceleration?: number; assist?: Partial<AssistHistory>;
}
export function stateFrom(data: AuthoritativeState): VehicleState {
  const result: VehicleState = { ...data,
    position: Object.freeze({ ...data.position }), worldVelocity: Object.freeze({ ...data.worldVelocity }),
    tires: Object.freeze({ ...data.tires }), assist: Object.freeze({ ...data.assist }),
    protection: Object.freeze({ ...data.protection }), energy: Object.freeze({ ...data.energy }),
    get speed() { return norm(this.worldVelocity); },
    get motion() { return this.speed === 0 ? this.theta : Math.atan2(this.worldVelocity.y, this.worldVelocity.x); },
    get beta() { return this.speed === 0 ? 0 : wrap(this.motion - this.theta); },
    get u() { return dot(this.worldVelocity, forward(this.theta)); },
    get v() { return dot(this.worldVelocity, right(this.theta)); },
  };
  return Object.freeze(result);
}
export function createState(profile: VehicleProfile, initial: InitialState = {}): VehicleState {
  const allowed = ['position', 'worldVelocity', 'theta', 'r', 'delta', 'h', 'tires', 'previousLongAcceleration', 'assist'];
  for (const key of Object.keys(initial)) if (!allowed.includes(key)) throw new Error(`initial.${key}: 非权威字段，不允许注入speed/motion/beta等派生量`);
  const data: AuthoritativeState = {
    position: initial.position ?? { x: 0, y: 0 }, worldVelocity: initial.worldVelocity ?? { x: 0, y: 0 },
    theta: initial.theta ?? 0, r: initial.r ?? 0, delta: initial.delta ?? 0, h: initial.h ?? 0,
    tires: initial.tires ?? { front: 0, rear: 0 }, previousLongAcceleration: initial.previousLongAcceleration ?? 0,
    assist: { betaRef: 0, routeRate: 0, turnSign: 1, lastTarget: null, targetRate: 0, ...initial.assist },
    protection: { count: 0, strength: 0, loadCount: 0 },
    energy: { tireDissipation: 0, rollingDissipation: 0, gameDissipation: 0, projectionDissipation: 0, driveWork: 0 }, time: 0,
  };
  function finite(obj: object, path: string): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}.${key}: 非有限值`);
      if (value && typeof value === 'object') finite(value, `${path}.${key}`);
    }
  }
  finite(data, 'initial');
  for (const [name, value] of Object.entries({ 'position.x': data.position.x, 'position.y': data.position.y, 'worldVelocity.x': data.worldVelocity.x, 'worldVelocity.y': data.worldVelocity.y,
    r: data.r, delta: data.delta, theta: data.theta, h: data.h, previousLongAcceleration: data.previousLongAcceleration,
    'tires.front': data.tires.front, 'tires.rear': data.tires.rear, 'assist.betaRef': data.assist.betaRef, 'assist.routeRate': data.assist.routeRate,
    'assist.turnSign': data.assist.turnSign, 'assist.targetRate': data.assist.targetRate })) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`initial.${name}: 缺失或非有限数值`);
  }
  if (data.assist.lastTarget !== null && !Number.isFinite(data.assist.lastTarget)) throw new Error('initial.assist.lastTarget: 非法历史');
  if (Math.abs(data.r) > 8) throw new Error('initial.r: 当前格式支持绝对值≤8rad/s');
  const s = stateFrom(data);
  if (s.speed > profile.power.maxSpeed || Math.abs(s.delta) > profile.steering.maxAngle || s.h < 0 || s.h > 1 || Math.abs(s.beta) > RULES.hardSlip || (s.speed === 0 && s.r !== 0)) throw new Error('initial: 超出速度、前轮、漂移、前进或静止横摆边界');
  return s;
}
/** 重置／换车不继承任何动力或辅助历史。 */
export const resetState = (profile: VehicleProfile, position: Vec2 = { x: 0, y: 0 }, theta = 0): VehicleState => createState(profile, { position, theta });
/** 场景负责求交及姿态回退；本接口完整清除会在下一步释放的旧力。 */
export const collisionStop = (profile: VehicleProfile, state: VehicleState, position = state.position, theta = state.theta): VehicleState => createState(profile, { position, theta });
