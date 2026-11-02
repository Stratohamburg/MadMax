export interface MassElement { mass: number; x: number; y: number; z: number; inertia: number }
/** 核心质量加权与平行轴公式，不知道装备、格子或耐久。 */
export function massProperties(elements: readonly MassElement[]) {
  if (!elements.length || elements.some(e => ![e.mass, e.x, e.y, e.z, e.inertia].every(Number.isFinite) || e.mass < 0 || e.z < 0 || e.inertia < 0))
    throw new Error("mass: 非法质量元素");
  const mass = elements.reduce((n, e) => n + e.mass, 0);
  if (mass <= 0) throw new Error("mass: 总质量必须为正");
  const center = { x: 0, y: 0, z: 0 };
  for (const e of elements) for (const axis of ["x", "y", "z"] as const) center[axis] += e.mass * e[axis] / mass;
  const inertia = elements.reduce((n, e) => n + e.inertia + e.mass * ((e.x - center.x) ** 2 + (e.y - center.y) ** 2), 0);
  return { mass, center, inertia };
}
