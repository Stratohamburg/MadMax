export const PARAMETER_VERSION = 'baseline-1';

export const PARAMETER_RULES = {
  maxSpeed: { label: '最高速度', unit: '世界单位/秒', value: 12, min: 0.01, max: 100 },
  bodyLength: { label: '车身长度', unit: '世界单位', value: 1.2, min: 0.1, max: 5 },
  radius: { label: '碰撞半径', unit: '世界单位', value: 0.45, min: 0.05, max: 2 },
  acceleration: { label: '基础加速度 A0', unit: '世界单位/秒²', value: 6, min: 0.01, max: 100 },
  braking: { label: '基础减速度 B0', unit: '世界单位/秒²', value: 8, min: 0.01, max: 100 },
  accelerationCurve: { label: '加速系数 ka', unit: '无量纲', value: 2, min: 0.001, max: 20 },
  brakingCurve: { label: '减速系数 kb', unit: '无量纲', value: 1, min: 0.001, max: 20 },
  steeringSpeed: { label: '低速过渡 Vs', unit: '世界单位/秒', value: 0.8, min: 0.01, max: 20 },
  normalTurn: { label: '普通基础转向率', unit: '弧度/秒', value: 3, min: 0.01, max: 20 },
  driftTurn: { label: '漂移基础转向率', unit: '弧度/秒', value: 5, min: 0.01, max: 20 },
  normalTurnCurve: { label: '普通转向系数', unit: '无量纲', value: 1.4, min: 0.001, max: 20 },
  driftTurnCurve: { label: '漂移转向系数', unit: '无量纲', value: 0.8, min: 0.001, max: 20 },
  normalGrip: { label: '普通抓地响应', unit: '1/秒', value: 12, min: 0.01, max: 100 },
  driftGrip: { label: '漂移抓地响应', unit: '1/秒', value: 4, min: 0.01, max: 100 },
  lowSpeedBlend: { label: '低速抓地收敛比例', unit: 'Vmax 比例', value: 0.3, min: 0.01, max: 1 },
  normalLoss: { label: '普通转向损失', unit: '1/秒', value: 0.18, min: 0.001, max: 10 },
  driftLoss: { label: '漂移转向损失', unit: '1/秒', value: 0.45, min: 0.001, max: 10 },
  freeAngle: { label: '免损角', unit: '度', value: 5, min: 0, max: 89 },
  lossExponent: { label: '损失指数', unit: '无量纲', value: 2, min: 1, max: 8 },
  maxSlipAngle: { label: '最大侧滑角', unit: '度', value: 65, min: 1, max: 89 },
  exitRatio: { label: '漂移退出半径', unit: 'R 倍数', value: 1.2, min: 1.001, max: 3 },
  enterRatio: { label: '漂移进入半径', unit: 'R 倍数', value: 1.4, min: 1.002, max: 4 },
} as const;

export type VehicleConfig = { [K in keyof typeof PARAMETER_RULES]: number };
export const DEFAULT_CONFIG = Object.fromEntries(
  Object.entries(PARAMETER_RULES).map(([key, rule]) => [key, rule.value]),
) as VehicleConfig;

export function validateConfig(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['参数必须为完整对象'];
  const config = value as VehicleConfig;
  const errors: string[] = [];
  for (const key of Object.keys(PARAMETER_RULES) as (keyof VehicleConfig)[]) {
    const rule = PARAMETER_RULES[key];
    if (!Number.isFinite(config[key]) || config[key] < rule.min || config[key] > rule.max) {
      errors.push(`${rule.label}须在 ${rule.min}～${rule.max} ${rule.unit} 内`);
    }
  }
  if (config.driftGrip >= config.normalGrip) errors.push('漂移抓地必须小于普通抓地');
  if (config.driftLoss <= config.normalLoss) errors.push('漂移损失必须大于普通损失');
  if (!(1 < config.exitRatio && config.exitRatio < config.enterRatio)) errors.push('半径必须满足 1 < Rexit/R < Renter/R');
  return errors;
}
