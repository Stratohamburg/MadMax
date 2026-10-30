import { MODEL_VERSION, PROFILE_SCHEMA_VERSION } from './physics/config';
import { getProfile } from './physics/profiles';
import { SURFACE_VERSION, SURFACES } from './physics/surfaces';
import { createState } from './physics/state';
import type { InitialState, VehicleState } from './physics/state';
import type { VehicleProfile } from './physics/config';

export const SNAPSHOT_VERSION = 'vehicle-snapshot-1' as const;
export interface VehicleSnapshot {
  snapshotVersion: typeof SNAPSHOT_VERSION;
  modelVersion: typeof MODEL_VERSION;
  profileSchemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileRevision: string;
  surfaceVersion: typeof SURFACE_VERSION;
  surfaceId: string;
  sceneVersion: string;
  initial: InitialState;
}

function cloneInitial(state: VehicleState): InitialState {
  return structuredClone({ position: state.position, worldVelocity: state.worldVelocity, theta: state.theta, r: state.r, delta: state.delta, h: state.h,
    tires: state.tires, previousLongAcceleration: state.previousLongAcceleration, assist: state.assist });
}

export function createVehicleSnapshot(state: VehicleState, profile: VehicleProfile, sceneVersion: string, surfaceId = 'dry-hard'): VehicleSnapshot {
  if (profile.modelVersion !== MODEL_VERSION || profile.profileSchemaVersion !== PROFILE_SCHEMA_VERSION) throw new Error('snapshot: 不兼容车型版本');
  const surface = Object.values(SURFACES).find(item => item.surfaceId === surfaceId);
  if (!surface) throw new Error(`snapshot.surfaceId: 未知路面${surfaceId}`);
  return { snapshotVersion: SNAPSHOT_VERSION, modelVersion: MODEL_VERSION, profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: profile.profileId, profileRevision: profile.profileRevision, surfaceVersion: SURFACE_VERSION, surfaceId, sceneVersion,
    initial: cloneInitial(state) };
}

export function restoreVehicleSnapshot(snapshot: unknown): { state: VehicleState; profile: VehicleProfile; surfaceId: string; sceneVersion: string } {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('snapshot: 必须为完整对象');
  const value = snapshot as Partial<VehicleSnapshot>;
  if (value.snapshotVersion !== SNAPSHOT_VERSION || value.modelVersion !== MODEL_VERSION || value.profileSchemaVersion !== PROFILE_SCHEMA_VERSION || value.surfaceVersion !== SURFACE_VERSION) throw new Error('snapshot: 版本不兼容，拒绝baseline-1/axle-dynamics-1');
  if (typeof value.profileId !== 'string' || typeof value.profileRevision !== 'string' || typeof value.sceneVersion !== 'string' || typeof value.surfaceId !== 'string') throw new Error('snapshot: 缺少车型、路面或场景版本');
  const profile = getProfile(value.profileId);
  if (profile.profileRevision !== value.profileRevision) throw new Error('snapshot.profileRevision: 与当前车型不一致');
  if (!Object.values(SURFACES).some(surface => surface.surfaceId === value.surfaceId)) throw new Error('snapshot.surfaceId: 未知路面');
  const state = createState(profile, value.initial);
  return { state, profile, surfaceId: value.surfaceId, sceneVersion: value.sceneVersion };
}
