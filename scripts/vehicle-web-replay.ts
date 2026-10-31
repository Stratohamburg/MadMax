import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROFILES } from "../src/vehicle/physics/profiles.ts";
import {
  MODEL_VERSION,
  PROFILE_SCHEMA_VERSION,
  RULES,
} from "../src/vehicle/physics/config.ts";
import { SURFACE_VERSION } from "../src/vehicle/physics/surfaces.ts";
import {
  createPhysicsVehicle,
  observePhysicsVehicle,
} from "../src/vehicle/model.ts";
import { stepInWorld } from "../src/scene/collision.ts";
import type { Intent } from "../src/vehicle/physics/state.ts";

const output = resolve(
  process.argv[2] ??
    "openspec/changes/validate-driving-prototype/evidence/vehicle-physics-2",
);
const sceneVersion = "driving-playground-3";
const world = {
  sceneVersion,
  bounds: { x: -200, y: -200, width: 400, height: 400 },
  obstacles: [],
};
const fpsValues = [30, 60, 120];
const inputAt = (time: number, profile: (typeof PROFILES)[number]): Intent => {
  if (time < 1)
    return {
      targetSpeed: profile.power.maxSpeed * 0.5,
      angle: 0,
      drift: false,
    };
  if (time < 3)
    return {
      targetSpeed: profile.power.maxSpeed,
      angle: Math.PI / 2,
      drift: false,
    };
  if (time < 5)
    return {
      targetSpeed: profile.power.maxSpeed,
      angle: Math.PI / 2,
      drift: true,
    };
  if (time < 7)
    return {
      targetSpeed: profile.power.maxSpeed,
      angle: -Math.PI / 2,
      drift: true,
    };
  if (time < 8)
    return { targetSpeed: profile.power.maxSpeed, angle: 0, drift: false };
  return { targetSpeed: 0, angle: null, drift: false };
};

function run(profile: (typeof PROFILES)[number], renderFps: number) {
  let state = createPhysicsVehicle({ x: -11, y: 19 }, -Math.PI / 2, profile);
  let previous = state;
  let input = inputAt(0, profile);
  let accumulator = 0;
  let wall = 0;
  let steps = 0;
  const frameDt = 1 / renderFps;
  while (wall < 10 - 1e-12) {
    const nextWall = Math.min(10, wall + frameDt);
    accumulator += nextWall - wall;
    while (accumulator + 1e-10 >= RULES.outerStep) {
      previous = state;
      input = inputAt(state.time + RULES.outerStep * 0.5, profile);
      state = stepInWorld(
        state,
        input,
        profile,
        RULES.outerStep,
        world,
      ) as typeof state;
      accumulator -= RULES.outerStep;
      steps++;
    }
    wall = nextWall;
  }
  const observation = observePhysicsVehicle(state, profile, input);
  return {
    renderFps,
    physicalSteps: steps,
    final: {
      position: state.position,
      speed: state.speed,
      theta: state.theta,
      motion: state.motion,
      beta: state.beta,
      r: state.r,
      delta: state.delta,
      routeRate: observation.route.routeRate,
      frontSlipVelocity: observation.front.slipVelocity,
      h: state.h,
    },
    observation: {
      modelVersion: observation.modelVersion,
      profileId: observation.profileId,
      surface: observation.front.surface.surfaceId,
    },
    previousPosition: previous.position,
  };
}

const profiles = [];
for (const profile of PROFILES) {
  const runs = fpsValues.map((fps) => run(profile, fps));
  const reference = runs.at(-1)!;
  const deltas = runs.map((result) => ({
    renderFps: result.renderFps,
    position: Math.hypot(
      result.final.position.x - reference.final.position.x,
      result.final.position.y - reference.final.position.y,
    ),
    speed: Math.abs(result.final.speed - reference.final.speed),
    theta: Math.abs(result.final.theta - reference.final.theta),
    motion: Math.abs(result.final.motion - reference.final.motion),
    beta: Math.abs(result.final.beta - reference.final.beta),
    r: Math.abs(result.final.r - reference.final.r),
    delta: Math.abs(result.final.delta - reference.final.delta),
    routeRate: Math.abs(result.final.routeRate - reference.final.routeRate),
    frontSlipVelocity: Math.abs(
      result.final.frontSlipVelocity - reference.final.frontSlipVelocity,
    ),
  }));
  const folder = resolve(output, profile.profileId, profile.profileRevision);
  mkdirSync(folder, { recursive: true });
  const report = {
    modelVersion: MODEL_VERSION,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    surfaceVersion: SURFACE_VERSION,
    sceneVersion,
    profileId: profile.profileId,
    profileRevision: profile.profileRevision,
    duration: 10,
    fps: runs,
    deltas,
    tolerances: {
      position: 0.012,
      speed: 0.06,
      angle: (0.5 * Math.PI) / 180,
      yaw: 0.08,
      routeRate: 0.08,
      frontSlipVelocity: 0.05,
    },
    passed: deltas.every(
      (delta) =>
        delta.position <= 0.012 &&
        delta.speed <= 0.06 &&
        delta.theta <= (0.5 * Math.PI) / 180 &&
        delta.motion <= (0.5 * Math.PI) / 180 &&
        delta.r <= 0.08 &&
        delta.delta <= (0.5 * Math.PI) / 180 &&
        delta.routeRate <= 0.08 &&
        delta.frontSlipVelocity <= 0.05,
    ),
  };
  writeFileSync(
    resolve(folder, "replay.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  profiles.push({
    profileId: profile.profileId,
    profileRevision: profile.profileRevision,
    passed: report.passed,
    deltas,
  });
}
const summary = {
  modelVersion: MODEL_VERSION,
  profileSchemaVersion: PROFILE_SCHEMA_VERSION,
  surfaceVersion: SURFACE_VERSION,
  sceneVersion,
  duration: 10,
  renderFps: fpsValues,
  profiles,
  passed: profiles.every((profile) => profile.passed),
  historicalEvidence: "baseline-1与vehicle-physics-1原目录保留",
};
mkdirSync(output, { recursive: true });
writeFileSync(
  resolve(output, "replay-summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary));
if (!summary.passed) process.exitCode = 1;
