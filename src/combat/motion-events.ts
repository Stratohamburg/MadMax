import type { VehicleState } from "../vehicle/physics/state";
import type { PassiveEvent } from "./weapons/types";

/** 名称描述实际运动；漂移辅助请求不参与判断。 */
export function motionEvents(vehicle: VehicleState, boostForce: number, firstSequence: number, dt: number): PassiveEvent[] {
  const events: PassiveEvent[] = [{ sequence: firstSequence, type: "speed", magnitude: vehicle.speed }];
  if (vehicle.speed >= 1 && Math.abs(vehicle.beta) >= 5 * Math.PI / 180)
    events.push({ sequence: firstSequence + events.length, type: "drift", magnitude: dt });
  if (boostForce > 0) events.push({ sequence: firstSequence + events.length, type: "boost", magnitude: dt });
  return events;
}
