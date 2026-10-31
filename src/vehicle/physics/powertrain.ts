import type { PhysicalProfile } from "./config";
/** 特征速度影响动力曲线，不能用来截断实际速度。 */
export function availableDriveForce(
  peripheralSpeed: number,
  p: PhysicalProfile,
): number {
  return (
    p.power.driveForce /
    (1 + p.power.accelerationCurve * (peripheralSpeed / p.power.maxSpeed) ** 2)
  );
}
