/** 无DOM公共入口；网页通过src/vehicle/model.ts消费同一套函数式核心。 */
export * from "./config";
export { IDLE, createState, resetState, collisionStop } from "./state";
export type {
  Intent,
  TireHistory,
  AssistHistory,
  EnergyLedger,
  AuthoritativeState,
  VehicleState,
  InitialState,
} from "./state";
export * from "./dynamics";
export * from "./geometry";
export * from "./surfaces";
export * from "./profiles";
export { rad, deg, wrap, angleError } from "./math";

export {
  advancePhysical,
  physicalObservation,
  mechanicalEnergy,
  applyExternalImpulse,
} from "./physical";
export { createPhysicalState, physicalFrom } from "./state";
export type { Actuation, PhysicalState, PhysicalData } from "./state";
export * from "./mechanics";
export * from "./reconfigure";
export * from "./body-contact";
