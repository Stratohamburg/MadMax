import { describe, expect, it } from 'vitest';
import { createPhysicsVehicle, getProfile, createVehicleSnapshot, restoreVehicleSnapshot } from '../../src/vehicle/model';

describe('vehicle-snapshot-1', () => {
  it('保存与恢复完整核心初态且拒绝派生字段和旧版本', () => {
    const profile = getProfile('rally-car');
    const state = createPhysicsVehicle({ x: 2, y: -3 }, 0.2, profile, { worldVelocity: { x: 2, y: 0.5 }, r: 0.1, h: 0.4 });
    const snapshot = createVehicleSnapshot(state, profile, 'driving-playground-2', 'loose');
    const restored = restoreVehicleSnapshot(snapshot);
    expect(restored.profile.profileId).toBe('rally-car');
    expect(restored.surfaceId).toBe('loose');
    expect(restored.state.position).toEqual(state.position);
    expect(restored.state.worldVelocity).toEqual(state.worldVelocity);
    expect(restored.state.h).toBe(state.h);
    expect(() => restoreVehicleSnapshot({ ...snapshot, modelVersion: 'baseline-1' })).toThrow();
    expect(() => restoreVehicleSnapshot({ ...snapshot, initial: { ...snapshot.initial, speed: 2 } })).toThrow();
  });
});
