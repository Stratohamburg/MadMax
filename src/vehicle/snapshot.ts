import {
  MODEL_VERSION,
  PROFILE_SCHEMA_VERSION,
  validateProfile,
} from "./physics/config";
import type { VehicleProfile } from "./physics/config";
import { SURFACE_VERSION, SURFACES } from "./physics/surfaces";
import { createState } from "./physics/state";
import type { AuthoritativeState, VehicleState } from "./physics/state";
export const SNAPSHOT_VERSION = "vehicle-snapshot-2" as const;
export interface VehicleSnapshot {
  snapshotVersion: typeof SNAPSHOT_VERSION;
  modelVersion: typeof MODEL_VERSION;
  profileSchemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileRevision: string;
  profile: VehicleProfile;
  surfaceVersion: typeof SURFACE_VERSION;
  surfaceId: string;
  sceneVersion: string;
  initial: AuthoritativeState;
}
export function createVehicleSnapshot(
  s: VehicleState,
  p: VehicleProfile,
  sceneVersion: string,
  surfaceId = "dry-hard",
): VehicleSnapshot {
  const errors = validateProfile(p);
  if (errors.length) throw new Error(errors.join("\n"));
  if (!Object.values(SURFACES).some((x) => x.surfaceId === surfaceId))
    throw new Error("snapshot.surfaceId: 未知路面");
  const {
    position,
    worldVelocity,
    theta,
    r,
    delta,
    wheelSpeeds,
    longitudinalForces,
    tires,
    previousLongAcceleration,
    assist,
    time,
    energy,
  } = s;
  return structuredClone({
    snapshotVersion: SNAPSHOT_VERSION,
    modelVersion: MODEL_VERSION,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: p.profileId,
    profileRevision: p.profileRevision,
    profile: p,
    surfaceVersion: SURFACE_VERSION,
    surfaceId,
    sceneVersion,
    initial: {
      position,
      worldVelocity,
      theta,
      r,
      delta,
      wheelSpeeds,
      longitudinalForces,
      tires,
      previousLongAcceleration,
      assist,
      time,
      energy,
    },
  });
}
export function restoreVehicleSnapshot(snapshot: unknown): {
  state: VehicleState;
  profile: VehicleProfile;
  surfaceId: string;
  sceneVersion: string;
} {
  if (!snapshot || typeof snapshot !== "object")
    throw new Error("snapshot: 必须为完整对象");
  const v = snapshot as VehicleSnapshot;
  if (
    v.snapshotVersion !== SNAPSHOT_VERSION ||
    v.modelVersion !== MODEL_VERSION ||
    v.profileSchemaVersion !== PROFILE_SCHEMA_VERSION ||
    v.surfaceVersion !== SURFACE_VERSION
  )
    throw new Error("snapshot: 版本不兼容");
  const errors = validateProfile(v.profile);
  if (errors.length) throw new Error(errors.join("\n"));
  if (
    v.profileId !== v.profile.profileId ||
    v.profileRevision !== v.profile.profileRevision ||
    typeof v.sceneVersion !== "string" ||
    !Object.values(SURFACES).some((s) => s.surfaceId === v.surfaceId)
  )
    throw new Error("snapshot: 元数据不一致");
  const fields = [
    "position",
    "worldVelocity",
    "theta",
    "r",
    "delta",
    "wheelSpeeds",
    "longitudinalForces",
    "tires",
    "previousLongAcceleration",
    "assist",
    "time",
    "energy",
  ];
  for (const key of fields)
    if (!v.initial || !(key in v.initial))
      throw new Error(`snapshot.initial.${key}: 缺失权威状态`);
  for (const key of Object.keys(v.initial))
    if (!fields.includes(key))
      throw new Error(`snapshot.initial.${key}: 非权威字段`);
  for (const key of [
    "betaRef",
    "routeRate",
    "turnSign",
    "lastTarget",
    "targetRate",
    "driftBlend",
  ])
    if (!v.initial.assist || !(key in v.initial.assist))
      throw new Error(`snapshot.initial.assist.${key}: 缺失控制历史`);
  return {
    state: createState(v.profile, v.initial),
    profile: structuredClone(v.profile),
    surfaceId: v.surfaceId,
    sceneVersion: v.sceneVersion,
  };
}
