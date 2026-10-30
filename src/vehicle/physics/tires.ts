import type { TireParameters } from './config';
import { RULES } from './config';
import type { Surface } from './surfaces';
import { clamp } from './math';

export function tireProperties(t: TireParameters, load: number, surface: Surface, gripScale = 1, stiffnessScale = 1) {
  const ratio = load / t.nominalLoad;
  const sensitivity = clamp(1 - t.loadSensitivity * (ratio - 1), 0.25, 1.5);
  const adaptation = t.adaptation[surface.family];
  const muX = Math.min(3, t.muX * surface.grip * adaptation * sensitivity) * gripScale;
  const muY = Math.min(3, t.muY * surface.grip * adaptation * sensitivity) * gripScale;
  return { load, muX, muY, capX: muX * load, capY: muY * load,
    stiffness: load <= 0 ? 0 : t.stiffness * ratio ** t.stiffnessExponent * stiffnessScale };
}
/** 小侧偏导数为-C，峰位由a*Fpeak/C派生；两段连接处一阶导数均为零。 */
export function lateralCurve(alpha: number, stiffness: number, peakForce: number, t: Pick<TireParameters, 'shape' | 'slide' | 'falloff'>): number {
  if (peakForce <= 0 || stiffness <= 0 || alpha === 0) return 0;
  const peakAngle = t.shape * peakForce / stiffness, x = Math.abs(alpha), z = x / peakAngle;
  const magnitude = z <= 1 ? peakForce * (t.shape * z + (3 - 2 * t.shape) * z * z + (t.shape - 2) * z ** 3)
    : peakForce * (t.slide + (1 - t.slide) * Math.exp(-(((x - peakAngle) / t.falloff) ** 2)));
  return -Math.sign(alpha) * magnitude;
}
export function combinedForce(requestX: number, pureY: number, capX: number, capY: number) {
  const fx = capX <= 0 ? 0 : clamp(requestX, -capX, capX);
  const remaining = capX <= 0 ? 1 : Math.sqrt(Math.max(0, 1 - (fx / capX) ** 2));
  const lateralCap = capY * remaining;
  const fy = clamp(pureY * remaining, -lateralCap, lateralCap);
  return { fx, fy, lateralCap, utilization: (capX > 0 ? (fx / capX) ** 2 : 0) + (capY > 0 ? (fy / capY) ** 2 : 0) };
}
/**
 * 无弹性储能的耗散松弛近似：闭式更新后投影到 {F*vSlip<=0, |F|<=cap}。
 * 各轴实际功率逐点非正，不让延迟旧力反向做功。状态是力记忆，不宣称弹性胎体。
 * 投影清除的是力记忆；储能恒零，projectionDissipation不虚构弹性能。
 */
export function relaxTire(previous: number, target: number, slipVelocity: number, cap: number, sigma: number, transport: number, dt: number) {
  const tau = sigma === 0 ? 0 : clamp(sigma / Math.max(Math.abs(transport), RULES.transportRegularization), RULES.minRelaxationTime, RULES.maxRelaxationTime);
  const raw = tau === 0 ? target : target + (previous - target) * Math.exp(-dt / tau);
  // 非零松弛的旧力在接地点侧滑过零前连续退到零，避免半空间投影造成力跳变。
  // σ=0保持原准静态曲线；该曲线本身已在零侧偏连续为零。
  const passiveCap = sigma === 0 ? cap : cap * Math.min(1, Math.abs(slipVelocity) / Math.max(0.01, Math.abs(transport) * 0.02));
  const bounded = clamp(raw, -passiveCap, passiveCap);
  const force = bounded * slipVelocity > 0 || slipVelocity === 0 ? 0 : bounded;
  return { force, tau, memoryProjection: Math.abs(raw - force), power: force * slipVelocity, storedEnergy: 0 };
}
