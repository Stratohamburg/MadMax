import type { Vec2 } from './math';
export const SURFACE_VERSION = 'vehicle-surface-1' as const;
export type SurfaceFamily = 'hard' | 'loose' | 'wet';
export interface Surface {
  schemaVersion: typeof SURFACE_VERSION; surfaceId: string; revision: string;
  family: SurfaceFamily; grip: number; rolling: number;
}
export const SURFACES: Record<SurfaceFamily, Surface> = {
  hard: { schemaVersion: SURFACE_VERSION, surfaceId: 'dry-hard', revision: '1', family: 'hard', grip: 1, rolling: 1 },
  loose: { schemaVersion: SURFACE_VERSION, surfaceId: 'loose', revision: '1', family: 'loose', grip: 0.78, rolling: 2.3 },
  wet: { schemaVersion: SURFACE_VERSION, surfaceId: 'wet', revision: '1', family: 'wet', grip: 0.52, rolling: 1.1 },
};
export type SurfaceSampler = (point: Vec2, axle: 'front' | 'rear', time: number) => Surface;
export const dryHard: SurfaceSampler = () => SURFACES.hard;
export function validateSurface(s: Surface): void {
  if (s.schemaVersion !== SURFACE_VERSION || !s.surfaceId || !s.revision || !(s.family in SURFACES) || !Number.isFinite(s.grip) || s.grip < 0 || s.grip > 2 || !Number.isFinite(s.rolling) || s.rolling < 0 || s.rolling > 5) throw new Error('surface: 不兼容版本、非法抓地/滚阻或缺少元数据');
}
