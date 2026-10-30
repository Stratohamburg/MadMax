export interface Vec2 { readonly x: number; readonly y: number }
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
export const rad = (degrees: number): number => degrees * Math.PI / 180;
export const deg = (radians: number): number => radians * 180 / Math.PI;
export const wrap = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));
export function angleError(target: number, actual: number, previousSign = 1): number {
  const d = wrap(target - actual);
  return Math.abs(Math.abs(d) - Math.PI) <= 4 * Number.EPSILON ? Math.PI * (previousSign || 1) : d;
}
export const smooth = (x: number): number => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const norm = (a: Vec2): number => Math.hypot(a.x, a.y);
export const forward = (theta: number): Vec2 => ({ x: Math.cos(theta), y: Math.sin(theta) });
export const right = (theta: number): Vec2 => ({ x: -Math.sin(theta), y: Math.cos(theta) });
export function approach(value: number, target: number, tau: number, rate: number, dt: number): number {
  return value + clamp((target - value) * -Math.expm1(-dt / tau), -rate * dt, rate * dt);
}
