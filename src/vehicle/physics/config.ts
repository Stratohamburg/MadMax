import { rad } from './math';

export const MODEL_VERSION = 'vehicle-physics-1' as const;
export const PROFILE_SCHEMA_VERSION = 'vehicle-profile-1' as const;
export const CONTROLLER_VERSION = 'route-assist-1' as const;
export interface PhysicsRules {
  modelVersion: typeof MODEL_VERSION;
  units: { length: 'game-L'; mass: 'game-M'; time: 's' };
  gravity: number; outerStep: number; substep: number;
  lowSpeedStart: number; lowSpeedEnd: number; lowSpeedResponse: number;
  transportRegularization: number; minRelaxationTime: number; maxRelaxationTime: number;
  softSlip: number; hardSlip: number;
}
export const RULES: PhysicsRules = {
  modelVersion: MODEL_VERSION, units: { length: 'game-L', mass: 'game-M', time: 's' },
  gravity: 9.81, outerStep: 1 / 120, substep: 1 / 240,
  lowSpeedStart: 0.45, lowSpeedEnd: 1.2, lowSpeedResponse: 0.06,
  transportRegularization: 0.25, minRelaxationTime: 1 / 480, maxRelaxationTime: 0.3,
  softSlip: rad(60), hardSlip: rad(85),
};
export interface TireParameters {
  stiffness: number; muX: number; muY: number; slide: number; shape: number; falloff: number;
  nominalLoad: number; loadSensitivity: number; stiffnessExponent: number; relaxation: number;
  adaptation: { hard: number; loose: number; wet: number };
}
export interface VehicleProfile {
  modelVersion: typeof MODEL_VERSION; profileSchemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profileId: string; profileRevision: string; label: string; category: string;
  geometry: { wheelbase: number; cgFromRear: number; width: number; track: number; frontOverhang: number; rearOverhang: number; heightCG: number };
  mass: number; kYaw: number;
  power: { driveForce: number; brakeForce: number; accelerationCurve: number; brakingCurve: number; maxSpeed: number; driveFront: number; brakeFront: number; rolling: number; aero: number };
  tires: { front: TireParameters; rear: TireParameters };
  steering: { maxAngle: number; highSpeedRatio: number; speedCurve: number; response: number; rate: number };
  drift: { rearGrip: number; rearStiffness: number; maxBeta: number; minSpeed: number; fullSpeed: number; demandRate: number; enterTime: number; exitTime: number; betaRate: number };
  assist: { routeGain: number; prediction: number; betaGain: number; yawGain: number; maxRouteRate: number; gripReserve: number; referenceTime: number };
  game: { normalLambda: number; driftLambda: number; freeAngle: number; exponent: number };
  acceptance: { normalWindow: number; recoveryWindow: number; recoverySpeed: number; recoveryHeading: number; recoveryYaw: number; recoverySteer: number; recoveryBlend: number; target: string };
}

const tire = (stiffness: number): TireParameters => ({ stiffness, muX: 1.05, muY: 1.05, slide: 0.82, shape: 1.5, falloff: rad(18), nominalLoad: 4.905, loadSensitivity: 0, stiffnessExponent: 1, relaxation: 0, adaptation: { hard: 1, loose: 0.72, wet: 0.85 } });
/** 完整参考快照；数值为统一游戏单位，不是实车标定。 */
export const REFERENCE_PROFILE: VehicleProfile = {
  modelVersion: MODEL_VERSION, profileSchemaVersion: PROFILE_SCHEMA_VERSION,
  profileId: 'sports-car', profileRevision: '1', label: '跑车', category: 'sports-car',
  geometry: { wheelbase: 0.84, cgFromRear: 0.5, width: 0.52, track: 0.44, frontOverhang: 0.18, rearOverhang: 0.18, heightCG: 0.12 },
  mass: 1, kYaw: 0.22,
  power: { driveForce: 6, brakeForce: 8, accelerationCurve: 2, brakingCurve: 1, maxSpeed: 12, driveFront: 0, brakeFront: 0.6, rolling: 0.012, aero: 0 },
  tires: { front: tire(70), rear: tire(76) },
  steering: { maxAngle: rad(34), highSpeedRatio: 0.48, speedCurve: 2, response: 0.055, rate: rad(300) },
  drift: { rearGrip: 0.72, rearStiffness: 0.15, maxBeta: rad(15), minSpeed: 1.5, fullSpeed: 4, demandRate: 0.55, enterTime: 0.3, exitTime: 0.22, betaRate: rad(45) },
  assist: { routeGain: 3.5, prediction: 0.12, betaGain: 1.4, yawGain: 0.32, maxRouteRate: 2, gripReserve: 0.78, referenceTime: 0.1 },
  game: { normalLambda: 0.18, driftLambda: 0.45, freeAngle: rad(5), exponent: 2 },
  acceptance: { normalWindow: 3, recoveryWindow: 4, recoverySpeed: 0.65, recoveryHeading: rad(25), recoveryYaw: 0.6, recoverySteer: rad(15), recoveryBlend: 1, target: '干硬路快速响应、真实反打与持续侧滑' },
};

export interface ParameterRule { unit: string; min: number; max: number }
/** 字段末段共用范围；关联约束在 validateProfile 内给出完整路径。 */
export const PARAMETER_UNITS: Record<string, ParameterRule> = {};
function rules(unit: string, min: number, max: number, names: string): void {
  for (const name of names.split(' ')) PARAMETER_UNITS[name] = { unit, min, max };
}
rules('L', 0.2, 8, 'wheelbase'); rules('1', 0.2, 0.8, 'cgFromRear');
rules('L', 0.05, 4, 'width track'); rules('L', 0, 3, 'frontOverhang rearOverhang heightCG');
rules('M', 0.1, 50, 'mass'); rules('1', 0.08, 1, 'kYaw');
rules('ML/T²', 0.01, 3000, 'driveForce brakeForce'); rules('1', 0, 10, 'accelerationCurve brakingCurve speedCurve');
rules('L/T', 0.1, 40, 'maxSpeed'); rules('1', 0, 1, 'driveFront brakeFront loadSensitivity gripReserve recoveryBlend');
rules('1', 0, 0.1, 'rolling'); rules('M/L', 0, 2, 'aero');
rules('ML/T²/rad', 0.1, 20000, 'stiffness'); rules('1', 0.05, 2, 'muX muY');
rules('1', 0.1, 1, 'slide highSpeedRatio rearGrip rearStiffness'); rules('1', 0.1, 3, 'shape');
rules('rad', rad(1), rad(80), 'falloff maxAngle'); rules('ML/T²', 0.01, 1000, 'nominalLoad');
rules('1', 0, 1.5, 'stiffnessExponent'); rules('L', 0, 1, 'relaxation'); rules('1', 0.1, 1.5, 'hard loose wet');
rules('s', 0.015, 2, 'response enterTime exitTime referenceTime'); rules('rad/T', rad(10), rad(720), 'rate betaRate');
rules('rad', 0, rad(40), 'maxBeta'); rules('L/T', 0, 20, 'minSpeed'); rules('L/T', 0.1, 30, 'fullSpeed');
rules('rad/T', 0.05, 8, 'demandRate maxRouteRate'); rules('1/T', 0.1, 12, 'routeGain betaGain');
rules('s', 0, 1, 'prediction'); rules('s', 0.01, 3, 'yawGain');
rules('1/T', 0, 3, 'normalLambda driftLambda'); rules('rad', 0, rad(80), 'freeAngle'); rules('1', 1, 6, 'exponent');
rules('s', 1, 7, 'normalWindow recoveryWindow'); rules('Vmax比例', 0.1, 0.8, 'recoverySpeed');
rules('rad', 0, rad(45), 'recoveryHeading recoverySteer'); rules('rad/T', 0, 1.5, 'recoveryYaw');

function shapeErrors(value: unknown, template: unknown, path: string, errors: string[]): void {
  if (typeof template === 'number') {
    const rule = PARAMETER_UNITS[path.split('.').at(-1)!];
    if (typeof value !== 'number' || !Number.isFinite(value) || (rule && (value < rule.min || value > rule.max))) errors.push(`${path}: 须为有限值${rule ? `，范围[${rule.min}, ${rule.max}] ${rule.unit}` : ''}`);
  } else if (typeof template === 'string') {
    if (typeof value !== 'string' || !value.trim()) errors.push(`${path}: 须为非空字符串`);
  } else if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path}: 须为完整对象`); return; }
    const obj = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(template)) shapeErrors(obj[key], item, `${path}.${key}`, errors);
    for (const key of Object.keys(obj)) if (!(key in template)) errors.push(`${path}.${key}: 未知或重复来源字段`);
  }
}
export function validateRules(value: PhysicsRules): string[] {
  const errors: string[] = [];
  // 全局规则可一起换算，当前格式固定游戏单位及离散方法。
  if (!value || value.modelVersion !== MODEL_VERSION) return ['rules.modelVersion: 不兼容版本'];
  if (value.units?.length !== 'game-L' || value.units?.mass !== 'game-M' || value.units?.time !== 's') errors.push('rules.units: 必须统一使用 game-L/game-M/s');
  for (const key of ['gravity', 'outerStep', 'substep', 'lowSpeedStart', 'lowSpeedEnd', 'lowSpeedResponse', 'transportRegularization', 'minRelaxationTime', 'maxRelaxationTime', 'softSlip', 'hardSlip'] as const) {
    if (!Number.isFinite(value[key]) || value[key] <= 0) errors.push(`rules.${key}: 须为有限正数`);
  }
  if (value.outerStep !== 1 / 120 || value.substep !== 1 / 240) errors.push('rules.substep: 当前格式固定1/120外步与1/240子步');
  if (!(value.lowSpeedStart < value.lowSpeedEnd && value.lowSpeedEnd <= 3)) errors.push('rules.lowSpeedStart/lowSpeedEnd: 须为递增区间且终点≤3');
  if (!(value.minRelaxationTime >= 1 / 480 && value.minRelaxationTime <= value.maxRelaxationTime && value.maxRelaxationTime <= 1)) errors.push('rules.minRelaxationTime/maxRelaxationTime: 不支持的瞬态时间范围');
  if (value.lowSpeedResponse < 0.025 || value.lowSpeedResponse > 0.5 || value.transportRegularization < 0.05 || value.transportRegularization > value.lowSpeedEnd) errors.push('rules.lowSpeedResponse/transportRegularization: 固定步长下响应或正则速度超限');
  if (!(value.gravity >= 1 && value.gravity <= 30 && value.softSlip < value.hardSlip && value.hardSlip < Math.PI / 2)) errors.push('rules.gravity/softSlip/hardSlip: 非法尺度或前进边界');
  return errors;
}
export function derived(p: VehicleProfile, rules = RULES) {
  const g = p.geometry;
  const lr = g.wheelbase * g.cgFromRear, lf = g.wheelbase - lr;
  return { lf, lr, bodyLength: g.wheelbase + g.frontOverhang + g.rearOverhang,
    inertia: p.mass * g.wheelbase ** 2 * p.kYaw, driveAcceleration: p.power.driveForce / p.mass,
    normalizedInertia: p.kYaw, frontStaticLoad: p.mass * rules.gravity * g.cgFromRear,
    rearStaticLoad: p.mass * rules.gravity * (1 - g.cgFromRear) };
}
export function validateProfile(value: unknown, rules = RULES): string[] {
  const errors = validateRules(rules);
  shapeErrors(value, REFERENCE_PROFILE, 'profile', errors);
  const p = value as VehicleProfile;
  if (p?.modelVersion !== MODEL_VERSION) errors.push('profile.modelVersion: 不兼容；拒绝baseline-1与axle-dynamics-1');
  if (p?.profileSchemaVersion !== PROFILE_SCHEMA_VERSION) errors.push('profile.profileSchemaVersion: 必须为vehicle-profile-1');
  if (errors.length) return errors;
  const g = p.geometry;
  if (g.track > g.width) errors.push('profile.geometry.track/width: 轮距不能超过车宽');
  if (g.wheelbase / Math.tan(p.steering.maxAngle) <= g.track / 2) errors.push('profile.geometry.track/steering.maxAngle: 阿克曼内轮分母必须为正');
  if (g.heightCG > g.wheelbase * 0.5) errors.push('profile.geometry.heightCG/wheelbase: 质心高不能超过半轴距');
  if (!(p.drift.minSpeed < p.drift.fullSpeed && p.drift.fullSpeed <= p.power.maxSpeed)) errors.push('profile.drift.minSpeed/fullSpeed: 须递增且不超过Vmax');
  if (p.game.driftLambda <= p.game.normalLambda) errors.push('profile.game.driftLambda: 必须大于normalLambda');
  // 显式RK2的最快小侧偏模态；同时限制每子步转向和几何响应。
  const d = derived(p, rules);
  // 连同标称载荷和载荷幂律检查；只用标称刚度会放过小nominalLoad造成的实际超刚度。
  const maxStiffness = (t: TireParameters) => t.stiffness * (p.mass * rules.gravity / t.nominalLoad) ** t.stiffnessExponent;
  const cfMax = maxStiffness(p.tires.front), crMax = maxStiffness(p.tires.rear);
  const fastest = Math.max((cfMax + crMax) / p.mass,
    (cfMax * d.lf ** 2 + crMax * d.lr ** 2) / d.inertia) / rules.lowSpeedEnd;
  if (fastest * rules.substep > 1.5) errors.push('profile.tires.stiffness/mass/kYaw: 固定子步稳定界超限');
  if (p.steering.rate * rules.substep > 0.08) errors.push('profile.steering.rate: 单子步转角超限');
  for (const axle of ['front', 'rear'] as const) {
    const t = p.tires[axle];
    const peak = t.shape * t.muY * t.nominalLoad / t.stiffness;
    if (!(peak >= rad(0.5) && peak <= rad(40))) errors.push(`profile.tires.${axle}.stiffness/shape/nominalLoad: 派生峰位须在0.5°～40°`);
    if (t.loadSensitivity > 0.5) errors.push(`profile.tires.${axle}.loadSensitivity: 当前载荷规律只支持≤0.5`);
  }
  return errors;
}
/** 原子应用：失败返回原对象，成功复制输入，避免调用方随后修改已验证配置。 */
export function applyProfile(current: VehicleProfile, candidate: unknown, rules = RULES): { profile: VehicleProfile; errors: string[] } {
  const errors = validateProfile(candidate, rules);
  return { profile: errors.length ? current : structuredClone(candidate as VehicleProfile), errors };
}
