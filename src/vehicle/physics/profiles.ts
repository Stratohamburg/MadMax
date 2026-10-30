import { REFERENCE_PROFILE, RULES, validateProfile } from './config';
import type { VehicleProfile } from './config';
import { rad } from './math';

interface Recipe {
  id: string; label: string; mass: number; length: number; power: number; inertia: number;
  brake: number; maxSpeed: number; driveFront: number; response: number; rate: number;
  normal: number; recovery: number; stiffness: number; grip: number; rearDrift: number;
  beta: number; loose: number; height: number; target: string;
}
const recipes: Recipe[] = [
  { id: 'light-pickup', label: '轻型皮卡', mass: 1.35, length: 1.1, power: 0.85, inertia: 1, brake: 0.92, maxSpeed: 11, driveFront: 0, response: 0.075, rate: 240, normal: 3.5, recovery: 4.5, stiffness: 0.95, grip: 0.98, rearDrift: 0.22, beta: 12, loose: 0.9, height: 0.17, target: '中等灵活，后轴可感知且甩尾可控' },
  { id: 'heavy-pickup', label: '重型皮卡', mass: 2.1, length: 1.18, power: 0.65, inertia: 1.15, brake: 0.72, maxSpeed: 10, driveFront: 0.4, response: 0.12, rate: 170, normal: 4, recovery: 5, stiffness: 1, grip: 1.02, rearDrift: 0.42, beta: 8, loose: 0.97, height: 0.2, target: '较慢响应、四驱牵引稳定、较小侧滑包络' },
  { id: 'van', label: 'van', mass: 1.6, length: 1.17, power: 0.68, inertia: 1.12, brake: 0.8, maxSpeed: 10, driveFront: 1, response: 0.11, rate: 180, normal: 4, recovery: 5, stiffness: 0.88, grip: 0.96, rearDrift: 0.48, beta: 7, loose: 0.7, height: 0.2, target: '前驱、温和响应与偏欠转' },
  { id: 'box-truck', label: '厢式货车', mass: 3.1, length: 1.55, power: 0.45, inertia: 1.25, brake: 0.6, maxSpeed: 9, driveFront: 0, response: 0.15, rate: 145, normal: 4.5, recovery: 5.5, stiffness: 0.9, grip: 0.92, rearDrift: 0.55, beta: 6, loose: 0.68, height: 0.25, target: '长轴距、制动提前量与缓慢恢复' },
  { id: 'truck', label: '卡车', mass: 4.8, length: 1.85, power: 0.34, inertia: 1.35, brake: 0.52, maxSpeed: 8, driveFront: 0, response: 0.19, rate: 115, normal: 5, recovery: 6, stiffness: 0.88, grip: 0.91, rearDrift: 0.62, beta: 5, loose: 0.72, height: 0.3, target: '刚性等效轴、大转弯半径、低动力重量比' },
  { id: 'heavy-truck', label: '重型卡车', mass: 8, length: 2.3, power: 0.24, inertia: 1.55, brake: 0.42, maxSpeed: 7, driveFront: 0, response: 0.24, rate: 85, normal: 6, recovery: 7, stiffness: 0.85, grip: 0.9, rearDrift: 0.7, beta: 4, loose: 0.74, height: 0.36, target: '刚性等效轴、最大占地、最慢响应与窄侧滑包络' },
  { id: 'sports-car', label: '跑车', mass: 1, length: 1, power: 1, inertia: 0.85, brake: 1, maxSpeed: 12, driveFront: 0, response: 0.055, rate: 300, normal: 3, recovery: 4, stiffness: 1, grip: 1, rearDrift: 0.15, beta: 15, loose: 0.72, height: 0.12, target: '干硬路高抓地、快速回正与精细响应' },
  { id: 'rally-car', label: '拉力赛车', mass: 1.05, length: 0.95, power: 0.95, inertia: 0.9, brake: 0.72, maxSpeed: 11.5, driveFront: 0.5, response: 0.035, rate: 420, normal: 3, recovery: 4, stiffness: 0.95, grip: 0.96, rearDrift: 0.15, beta: 17, loose: 1.25, height: 0.14, target: '四驱、松散地适应、快速转向与持续侧滑' },
  { id: 'muscle-car', label: '肌肉车', mass: 1.45, length: 1.08, power: 1.08, inertia: 1.1, brake: 0.7, maxSpeed: 12, driveFront: 0, response: 0.105, rate: 210, normal: 3.5, recovery: 4.5, stiffness: 0.86, grip: 0.97, rearDrift: 0.13, beta: 18, loose: 0.65, height: 0.14, target: '强直线动力、较慢姿态恢复与易失抓后轴' },
  { id: 'off-road', label: '越野车', mass: 1.55, length: 1, power: 0.7, inertia: 1.08, brake: 0.55, maxSpeed: 8.5, driveFront: 0.5, response: 0.095, rate: 200, normal: 4, recovery: 5, stiffness: 0.87, grip: 0.94, rearDrift: 0.35, beta: 10, loose: 1.35, height: 0.24, target: '较高质心、低速灵活、松散地牵引与较长制动距离' },
];
function materialize(r: Recipe): VehicleProfile {
  const p = structuredClone(REFERENCE_PROFILE);
  p.profileId = r.id; p.profileRevision = '1'; p.label = r.label; p.category = r.id;
  p.mass = r.mass; p.kYaw = 0.22 / 0.85 * r.inertia;
  p.geometry.wheelbase *= r.length; p.geometry.frontOverhang *= r.length; p.geometry.rearOverhang *= r.length;
  p.geometry.width *= Math.min(1.65, Math.sqrt(r.mass)); p.geometry.track = p.geometry.width * 0.846153846;
  p.geometry.heightCG = r.height;
  p.power.driveForce *= r.mass * r.power; p.power.brakeForce *= r.mass * r.brake;
  p.power.maxSpeed = r.maxSpeed; p.power.driveFront = r.driveFront;
  p.steering.response = r.response; p.steering.rate = rad(r.rate);
  p.drift.rearStiffness = r.rearDrift; p.drift.maxBeta = rad(r.beta);
  p.drift.minSpeed = Math.min(1.5, r.maxSpeed * 0.2); p.drift.fullSpeed = Math.min(4, r.maxSpeed * 0.45);
  for (const [axle, t] of Object.entries(p.tires)) {
    t.stiffness *= r.mass * r.stiffness; t.nominalLoad = r.mass * RULES.gravity / 2;
    t.muX *= r.grip; t.muY *= r.grip; t.adaptation.loose = r.loose;
    // 默认保持准静态；独立非零瞬态矩阵仍必须执行。
    t.relaxation = 0;
    if (r.id === 'van' && axle === 'front') t.stiffness *= 0.9;
    if (r.id === 'muscle-car' && axle === 'rear') t.stiffness *= 0.9;
  }
  // 较长车的辅助只调整有限参考与反馈，物理仍由同一轴力求解。
  p.assist.routeGain /= Math.sqrt(r.length); p.assist.yawGain *= Math.sqrt(r.length);
  p.assist.betaGain *= Math.sqrt(r.length);
  if (r.id === 'truck') { p.assist.routeGain *= 0.8; p.assist.betaGain *= 0.6; }
  if (r.id === 'heavy-truck') { p.assist.routeGain = 1.4; p.assist.betaGain = 0.5; p.assist.yawGain = 0.8; }
  p.acceptance.normalWindow = r.normal; p.acceptance.recoveryWindow = r.recovery;
  p.acceptance.target = r.target;
  if (r.mass > 2) { p.acceptance.recoveryHeading = rad(Math.min(20, r.beta + 6)); p.acceptance.recoveryYaw = 0.3 / Math.sqrt(r.length); p.acceptance.recoverySteer = rad(10); p.acceptance.recoverySpeed = 0.5; }
  const errors = validateProfile(p); if (errors.length) throw new Error(`${r.id}: ${errors.join('; ')}`);
  return p;
}
export const PROFILES: readonly VehicleProfile[] = recipes.map(materialize);
export function getProfile(id: string): VehicleProfile {
  const p = PROFILES.find(p => p.profileId === id); if (!p) throw new Error(`profileId: 未知车型${id}`);
  return structuredClone(p);
}
export const SIMILAR_PAIRS = [
  ['light-pickup', 'heavy-pickup'], ['van', 'box-truck'], ['box-truck', 'truck'], ['truck', 'heavy-truck'],
  ['sports-car', 'rally-car'], ['sports-car', 'muscle-car'], ['rally-car', 'off-road'],
] as const;
