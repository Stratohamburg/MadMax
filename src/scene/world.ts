export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
import type { SurfaceSampler } from "../vehicle/physics/surfaces";
import { SURFACES } from "../vehicle/physics/surfaces";
export interface World {
  bounds: Rect;
  obstacles: Rect[];
  surface?: SurfaceSampler;
  sceneVersion?: string;
}
export const playgroundSurface: SurfaceSampler = (point) => {
  if (point.x > 8 && point.y < -10) return SURFACES.wet;
  if (point.x < -5 && point.y < -10) return SURFACES.loose;
  return SURFACES.hard;
};
export const WORLD: World = {
  sceneVersion: "driving-playground-3",
  surface: playgroundSurface,
  bounds: { x: -30, y: -36, width: 60, height: 66 },
  obstacles: [
    { x: -3, y: 10, width: 2.5, height: 4 },
    { x: 3, y: 18, width: 3, height: 2 },
    { x: 21, y: -5, width: 2, height: 4 },
    { x: -22, y: -22, width: 3, height: 3 },
  ],
};
export const REGIONS = [
  { id: "straight", name: "01 直道", hint: "半速 · 起步 · 松手", x: -11, y: 9 },
  { id: "gentle", name: "02 缓弯", hint: "提前选线 · 小幅保速", x: -8, y: -21 },
  { id: "hairpin", name: "03 急弯", hint: "急转损失 · 侧滑", x: 14, y: -21 },
  {
    id: "slalom",
    name: "04 连续弯",
    hint: "进漂 · 退出 · 恢复抓地",
    x: 11,
    y: 1,
  },
  { id: "open", name: "05 开放区", hint: "障碍 · 接触脱离", x: 4, y: 13 },
] as const;
export const PRACTICE_AREAS = [
  {
    id: "geometry-circle",
    name: "固定前轮圆",
    x: -18,
    y: -20,
    radius: 2.2,
    hint: "固定 δ · 后轴圆",
  },
  {
    id: "ordinary-align",
    name: "普通对齐",
    x: -2,
    y: -24,
    radius: 2.2,
    hint: "路线 · 车头 · 运动",
  },
  {
    id: "drift-countersteer",
    name: "持续漂移／反打",
    x: 18,
    y: -3,
    radius: 2.5,
    hint: "h · β · r · 前轮",
  },
] as const;
