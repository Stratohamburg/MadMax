import type { TireParameters } from "./config";
import type { Surface } from "./surfaces";
import { clamp } from "./math";

export function tireProperties(
  t: TireParameters,
  load: number,
  surface: Surface,
  gripScale = 1,
  stiffnessScale = 1,
) {
  const ratio = load / t.nominalLoad;
  const sensitivity = clamp(1 - t.loadSensitivity * (ratio - 1), 0.25, 1.5);
  const adaptation = t.adaptation[surface.family];
  const muX =
    Math.min(3, t.muX * surface.grip * adaptation * sensitivity) * gripScale;
  const muY =
    Math.min(3, t.muY * surface.grip * adaptation * sensitivity) * gripScale;
  return {
    load,
    muX,
    muY,
    capX: muX * load,
    capY: muY * load,
    stiffness:
      load <= 0
        ? 0
        : t.stiffness * ratio ** t.stiffnessExponent * stiffnessScale,
  };
}
