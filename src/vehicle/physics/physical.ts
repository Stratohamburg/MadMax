/** 模式无关的平面刚体/轮胎接触求解器。输入只有执行器、物理参数和路面。 */
import { derived, RULES } from "./config";
import type { PhysicalProfile } from "./config";
import { axleLoads } from "./loads";
import { geometry } from "./geometry";
import { advanceSteering } from "./steering";
import { clamp, dot, forward, right, scale } from "./math";
import { physicalFrom } from "./state";
import type { Actuation, PhysicalState } from "./state";
import { dryHard, validateSurface } from "./surfaces";
import type { SurfaceSampler } from "./surfaces";
import { availableDriveForce } from "./powertrain";
import { tireProperties } from "./tires";
export function mechanicalEnergy(s: PhysicalState, p: PhysicalProfile): number {
  return (
    0.5 * p.mass * s.speed * s.speed +
    0.5 * derived(p).inertia * s.r * s.r +
    0.5 *
      p.wheels.inertia *
      (s.wheelSpeeds.front ** 2 + s.wheelSpeeds.rear ** 2)
  );
}
export function physicalObservation(
  s: PhysicalState,
  p: PhysicalProfile,
  surface: SurfaceSampler = dryHard,
) {
  const g = geometry(s, p),
    d = derived(p),
    loads = axleLoads(p, s.previousLongAcceleration),
    R = p.wheels.radius;
  const axle = (
    name: "front" | "rear",
    along: number,
    angle: number,
    load: number,
  ) => {
    const sample = surface(
      name === "front" ? g.frontAxle : g.rearAxle,
      name,
      s.time,
    );
    validateSurface(sample);
    const t = tireProperties(p.tires[name], load, sample),
      cs = Math.cos(angle),
      sn = Math.sin(angle),
      side = s.v + along * s.r;
    const transport = s.u * cs + side * sn,
      slip = side * cs - s.u * sn,
      longSlip = transport - R * s.wheelSpeeds[name];
    return {
      ...t,
      surface: sample,
      alpha: Math.atan2(slip, Math.max(Math.abs(transport), 0.25)),
      slipVelocity: slip,
      longSlip,
      transport,
      fx: s.longitudinalForces[name],
      fy: s.tires[name],
      power: s.longitudinalForces[name] * longSlip + s.tires[name] * slip,
      utilization:
        (s.longitudinalForces[name] / Math.max(t.capX, 1e-20)) ** 2 +
        (s.tires[name] / Math.max(t.capY, 1e-20)) ** 2,
      lateralCap: t.capY,
    };
  };
  return {
    geometry: g,
    loads,
    front: axle("front", d.lf, s.delta, loads.front),
    rear: axle("rear", -d.lr, 0, loads.rear),
  };
}
export function advancePhysical(
  s: PhysicalState,
  command: Actuation,
  p: PhysicalProfile,
  dt: number,
  surface: SurfaceSampler = dryHard,
): PhysicalState {
  if (!(dt > 0 && dt <= 1 / 120))
    throw new Error("physical dt: 必须为受支持正子步");
  if (
    ["steeringTarget", "drive", "brake", "rearBrake"].some(
      (k) => !Number.isFinite(command[k as keyof Actuation]),
    )
  )
    throw new Error("actuation: 非有限");
  const d = derived(p),
    m = p.mass,
    I = d.inertia,
    J = p.wheels.inertia,
    R = p.wheels.radius;
  const delta = advanceSteering(
    s.delta,
    command.steeringTarget,
    s.speed,
    p,
    dt,
  );
  let vx = s.worldVelocity.x,
    vy = s.worldVelocity.y,
    r = s.r;
  const omega = { ...s.wheelSpeeds };
  const energy = () =>
    0.5 * m * (vx * vx + vy * vy) +
    0.5 * I * r * r +
    0.5 * J * (omega.front ** 2 + omega.rear ** 2);
  const startEnergy = energy();
  let driveWork = 0,
    brakeLoss = 0,
    rollingLoss = 0;
  const drive = clamp(command.drive, 0, 1),
    brake = clamp(command.brake, 0, 1);
  // 特征速度只塑造可用动力，不限制车身速度。
  const motorSpeed =
    R *
    (Math.abs(omega.front) * p.power.driveFront +
      Math.abs(omega.rear) * (1 - p.power.driveFront));
  const available = availableDriveForce(motorSpeed, p);
  for (const name of ["front", "rear"] as const) {
    const before = energy();
    const share =
      name === "front" ? p.power.driveFront : 1 - p.power.driveFront;
    omega[name] += (available * R * drive * share * dt) / J;
    driveWork += energy() - before;
  }
  const obs = physicalObservation(s, p, surface);
  const rolling =
    (m *
      RULES.gravity *
      p.power.rolling *
      (obs.front.surface.rolling + obs.rear.surface.rolling)) /
      2 +
    p.power.aero * s.speed * s.speed;
  if (s.speed > 0) {
    const before = energy(),
      factor = Math.max(0, 1 - (rolling * dt) / (m * s.speed));
    vx *= factor;
    vy *= factor;
    rollingLoss = before - energy();
  }
  const contacts = (["front", "rear"] as const).map((name) => {
    const along = name === "front" ? d.lf : -d.lr,
      angle = s.theta + (name === "front" ? delta : 0),
      ex = forward(angle),
      ey = right(angle),
      arm = scale(forward(s.theta), along);
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x * b.y - a.y * b.x;
    const cx = cross(arm, ex),
      cy = cross(arm, ey),
      t = obs[name];
    const localSpeed = Math.hypot(t.transport, t.slipVelocity),
      slip = Math.hypot(t.longSlip, t.slipVelocity);
    const peak =
      p.tires[name].slide +
      (1 - p.tires[name].slide) *
        Math.exp(-((slip / Math.max(0.25, localSpeed * 0.15)) ** 2));
    // 隐式粘性接触：零速仍连续，抓地椭圆限制真实冲量。
    const k = t.stiffness / Math.max(localSpeed, RULES.transportRegularization),
      compliance = k > 0 ? 1 / (dt * k) : 1e20;
    return {
      name,
      ex,
      ey,
      cx,
      cy,
      capX: t.capX * peak * dt,
      capY: t.capY * peak * dt,
      kx: 1 / m + (cx * cx) / I + (R * R) / J + compliance,
      ky: 1 / m + (cy * cy) / I + compliance,
      cross: (cx * cy) / I,
      jx: 0,
      jy: 0,
    };
  });
  let tireWork = 0;
  const brakeUsed = { front: 0, rear: 0 };
  // 交替求解两个轴及制动约束，包含同一刚体上的接触耦合。
  for (let iteration = 0; iteration < RULES.solverIterations; iteration++) {
    for (const c of contacts) {
      const sx = vx * c.ex.x + vy * c.ex.y + c.cx * r - R * omega[c.name],
        sy = vx * c.ey.x + vy * c.ey.y + c.cy * r;
      const localSpeed = Math.hypot(
          obs[c.name].transport,
          obs[c.name].slipVelocity,
        ),
        comp =
          obs[c.name].stiffness > 0
            ? 1 /
              (dt *
                (obs[c.name].stiffness /
                  Math.max(localSpeed, RULES.transportRegularization)))
            : 1e20;
      const a = -sx - comp * c.jx,
        b = -sy - comp * c.jy,
        det = c.kx * c.ky - c.cross * c.cross;
      let jx = c.jx + (a * c.ky - b * c.cross) / det,
        jy = c.jy + (b * c.kx - a * c.cross) / det;
      const usage = Math.hypot(
        jx / Math.max(c.capX, 1e-20),
        jy / Math.max(c.capY, 1e-20),
      );
      if (usage > 1) {
        jx /= usage;
        jy /= usage;
      }
      const dx = jx - c.jx,
        dy = jy - c.jy;
      c.jx = jx;
      c.jy = jy;
      vx += (dx * c.ex.x + dy * c.ey.x) / m;
      vy += (dx * c.ex.y + dy * c.ey.y) / m;
      r += (c.cx * dx + c.cy * dy) / I;
      omega[c.name] -= (R * dx) / J;
      const endX = vx * c.ex.x + vy * c.ex.y + c.cx * r - R * omega[c.name],
        endY = vx * c.ey.x + vy * c.ey.y + c.cy * r;
      tireWork += 0.5 * dx * (sx + endX) + 0.5 * dy * (sy + endY);
    }
    for (const name of ["front", "rear"] as const) {
      const fraction =
        name === "front" ? p.power.brakeFront : 1 - p.power.brakeFront;
      const capacity =
        p.power.brakeForce *
        R *
        (brake * fraction +
          (name === "rear" ? clamp(command.rearBrake, 0, 1) : 0)) *
        dt;
      const before = energy();
      const impulse = clamp(
        -omega[name] * J,
        -capacity - brakeUsed[name],
        capacity - brakeUsed[name],
      );
      omega[name] += impulse / J;
      brakeUsed[name] += impulse;
      brakeLoss += before - energy();
    }
  }
  const tireLoss = -tireWork;
  const finalEnergy = energy(),
    residual =
      finalEnergy -
      startEnergy -
      driveWork +
      rollingLoss +
      brakeLoss +
      tireLoss;
  const front = contacts[0]!,
    rear = contacts[1]!;
  return physicalFrom({
    position: {
      x: s.position.x + (s.worldVelocity.x + vx) * 0.5 * dt,
      y: s.position.y + (s.worldVelocity.y + vy) * 0.5 * dt,
    },
    worldVelocity: { x: vx, y: vy },
    theta: s.theta + (s.r + r) * 0.5 * dt,
    r,
    delta,
    wheelSpeeds: omega,
    longitudinalForces: { front: front.jx / dt, rear: rear.jx / dt },
    tires: { front: front.jy / dt, rear: rear.jy / dt },
    previousLongAcceleration: dot(
      { x: (vx - s.worldVelocity.x) / dt, y: (vy - s.worldVelocity.y) / dt },
      forward(s.theta),
    ),
    time: s.time + dt,
    energy: {
      ...s.energy,
      driveWork: s.energy.driveWork + driveWork,
      brakeDissipation: s.energy.brakeDissipation + brakeLoss,
      tireDissipation: s.energy.tireDissipation + tireLoss,
      rollingDissipation: s.energy.rollingDissipation + rollingLoss,
      numericalResidual: s.energy.numericalResidual + residual,
    },
  });
}
