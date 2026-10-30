import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { FixedClock, TimedInput } from '../../src/simulation/clock';
import { DEFAULT_CONFIG as config, PARAMETER_VERSION } from '../../src/vehicle/config';
import { createVehicle, IDLE, degrees, shortestAngle } from '../../src/vehicle/model';
import type { Intent } from '../../src/vehicle/model';
import { stepInWorld } from '../../src/scene/collision';
import { Trails } from '../../src/scene/trails';

it('完整十秒链路：30/60/120 FPS 同时序输入回放满足位置、速度、两种朝向容差', () => {
  const events: { timestamp: number; value: Intent }[] = [
    { timestamp: 0, value: { targetSpeed: 6, angle: 0, drift: false } },
    { timestamp: 1.5, value: { targetSpeed: 12, angle: 0, drift: false } },
    { timestamp: 3, value: { targetSpeed: 12, angle: Math.PI / 4, drift: false } },
    { timestamp: 4.25, value: { targetSpeed: 12, angle: Math.PI / 2, drift: true } },
    { timestamp: 5.75, value: { targetSpeed: 12, angle: -0.5, drift: true } },
    { timestamp: 7, value: { targetSpeed: 12, angle: -0.5, drift: false } },
    { timestamp: 8.2, value: IDLE },
  ];
  const world = { bounds: { x: -10000, y: -10000, width: 20000, height: 20000 }, obstacles: [] };
  const results = [30, 60, 120].map(fps => {
    const clock = new FixedClock(); const inputs = new TimedInput<Intent>(IDLE); const trails = new Trails();
    let state = createVehicle({ x: 0, y: 0 }, 0);
    for (const event of events) inputs.push(event.timestamp, event.value);
    clock.advance(0, () => {});
    for (let frame = 1; frame <= fps * 10; frame++) clock.advance(frame / fps, (dt, time) => {
      const before = state; state = stepInWorld(state, inputs.sample(time), config, dt, world);
      trails.sample(before, state, config, clock.time);
    });
    return { fps, steps: clock.steps, state, trails: trails.segments.length };
  });
  const reference = results[2].state;
  const differences = results.map(result => ({ fps: result.fps,
    position: Math.hypot(result.state.x - reference.x, result.state.y - reference.y),
    speed: Math.abs(result.state.speed - reference.speed),
    headingDegrees: Math.abs(degrees(shortestAngle(result.state.heading - reference.heading))),
    motionDegrees: Math.abs(degrees(shortestAngle(result.state.motion - reference.motion))),
  }));
  for (const result of results) expect(result.steps).toBe(1200);
  for (const diff of differences) {
    expect(diff.position).toBeLessThanOrEqual(config.bodyLength * 0.01);
    expect(diff.speed).toBeLessThanOrEqual(config.maxSpeed * 0.005);
    expect(diff.headingDegrees).toBeLessThanOrEqual(0.5);
    expect(diff.motionDegrees).toBeLessThanOrEqual(0.5);
  }
  const directory = 'openspec/changes/validate-driving-prototype/evidence';
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/replay.json`, JSON.stringify({ parameterVersion: PARAMETER_VERSION, config, durationSeconds: 10,
    events, results, differences, tolerances: { position: config.bodyLength * 0.01, speed: config.maxSpeed * 0.005, headingDegrees: 0.5, motionDegrees: 0.5 } }, null, 2) + '\n');
});
