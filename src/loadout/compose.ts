import { getProfile } from "../vehicle/physics/profiles";
import { derived, PARAMETER_UNITS, validateProfile } from "../vehicle/physics/config";
import { evaluateAttribute } from "../stats/modifiers";
import type { AttributeModifier } from "../stats/modifiers";
import { CATALOG, compareId, mounts, occupiedCells, validateLoadout } from "./model";
import { resourceBudget } from "./resources";
import { KG_PER_GAME_MASS } from "./types";
import type { Loadout } from "./types";
import { massProperties } from "../vehicle/physics/mass-properties";
import { NM_PER_GAME_TORQUE, validateDrivetrain } from "../vehicle/physics/mechanics";

export interface ComposeOptions {
  modifiers?: readonly AttributeModifier[];
  /** 当前耐久比例；零耐久内置件仍有质量，脱落件由战斗移出清单。 */
  health?: Readonly<Record<string, number>>;
}
export interface ClampedParameter { path: string; requested: number; value: number }
export function compose(loadout: Loadout, options: ComposeOptions = {}) {
  const errors = validateLoadout(loadout);
  if (errors.length) throw new Error(errors.map(e => e.message).join("; "));
  const base = getProfile(loadout.chassisId), profile = structuredClone(base);
  const chassis = CATALOG.chassis[loadout.chassisId];
  const components = [...loadout.parts].sort((a, b) => compareId(a.instanceId, b.instanceId)).map(part => {
    const definition = CATALOG.parts[part.partId], cells = occupiedCells(part);
    const hp = options.health?.[part.instanceId] ?? 1;
    if (!Number.isFinite(hp) || hp < 0 || hp > 1) throw new Error(`health.${part.instanceId}: 须在0～1`);
    const mass = definition.massKg / KG_PER_GAME_MASS;
    const x = cells.reduce((sum, c) => sum + c.x, 0) / cells.length * chassis.cellSize;
    const y = cells.reduce((sum, c) => sum + c.y, 0) / cells.length * chassis.cellSize;
    const inertia = definition.yawInertia ?? cells.reduce((sum, cell) => sum + mass / cells.length * ((cell.x * chassis.cellSize - x) ** 2 + (cell.y * chassis.cellSize - y) ** 2 + chassis.cellSize ** 2 / 6), 0);
    return { part, definition, hp, performance: hp <= 0 ? 0 : hp <= 0.5 ? 0.5 : 1,
      mass, x, y, z: definition.height ?? base.geometry.heightCG + (part.layer === "outer" ? 0.12 : 0), inertia };
  });
  const properties = massProperties([{ mass: base.mass, x: 0, y: 0, z: base.geometry.heightCG, inertia: derived(base).inertia }, ...components]);
  const { mass, inertia } = properties, centerOfMass = properties.center;
  profile.mass = mass;
  if (components.length) profile.geometry.heightCG = centerOfMass.z;
  profile.geometry.cgFromRear = base.geometry.cgFromRear + centerOfMass.x / base.geometry.wheelbase;
  profile.geometry.cgLateral = centerOfMass.y;
  if (components.length) profile.kYaw = inertia / (mass * profile.geometry.wheelbase ** 2);
  const engineComponent = components.find(c => c.definition.engine && c.performance > 0);
  const gearboxComponent = components.find(c => c.definition.gearbox && c.performance > 0);
  const engine = engineComponent ? { ...engineComponent.definition.engine!,
    maxTorque: engineComponent.definition.engine!.maxTorque * engineComponent.performance,
    maxPower: engineComponent.definition.engine!.maxPower * engineComponent.performance } : undefined;
  const gearbox = gearboxComponent ? { ...gearboxComponent.definition.gearbox!,
    shiftTime: gearboxComponent.definition.gearbox!.shiftTime * (gearboxComponent.performance < 1 ? 2 : 1) } : undefined;
  const tags = ["vehicle", loadout.chassisId, ...new Set(components.flatMap(c => c.definition.tags))];
  const modifiers = options.modifiers ?? [];
  const evaluate = (value: number, attribute: string) => evaluateAttribute(value, modifiers, "vehicle", attribute, tags).value;
  if (engine && gearbox) {
    const originalForce = engine.maxTorque * gearbox.ratios[0] * gearbox.finalDrive * gearbox.efficiency / (NM_PER_GAME_TORQUE * profile.wheels.radius);
    const gain = Math.max(0, evaluate(originalForce, "power")) / originalForce;
    engine.maxTorque *= gain;
    engine.maxPower *= gain;
    // 加成先改变发动机能力，变速箱仍按自己的承载上限限制最终输出。
    profile.power.driveForce = Math.min(engine.maxTorque, gearbox.maxInputTorque) * gearbox.ratios[0] * gearbox.finalDrive * gearbox.efficiency / (NM_PER_GAME_TORQUE * profile.wheels.radius);
    profile.power.maxSpeed = Math.min(base.power.maxSpeed * Math.sqrt(engine.maxPower / 170),
      engine.redlineRpm * Math.PI / 30 * profile.wheels.radius / (gearbox.ratios.at(-1)! * gearbox.finalDrive));
  }
  else profile.power.driveForce = evaluate(profile.power.driveForce, "power");
  profile.power.maxSpeed = evaluate(profile.power.maxSpeed, "maxSpeed");
  for (const axle of ["front", "rear"] as const) {
    for (const c of components.filter(c => c.performance > 0 && c.definition.tire)) {
      const tire = c.definition.tire!;
      profile.tires[axle].muX *= 1 + (tire.grip - 1) * c.performance;
      profile.tires[axle].muY *= 1 + (tire.grip - 1) * c.performance;
      profile.tires[axle].stiffness *= 1 + (tire.stiffness - 1) * c.performance;
      profile.tires[axle].adaptation.loose *= 1 + (tire.loose - 1) * c.performance;
    }
    profile.tires[axle].muX = evaluate(profile.tires[axle].muX, "grip");
    profile.tires[axle].muY = evaluate(profile.tires[axle].muY, "grip");
    profile.tires[axle].stiffness = evaluate(profile.tires[axle].stiffness, "stiffness");
  }
  const clamped: ClampedParameter[] = [];
  const clampValue = (value: number, min: number, max: number, path: string): number => {
    const result = Math.min(max, Math.max(min, value));
    if (result !== value) clamped.push({ path, requested: value, value: result });
    return result;
  };
  const constrain = (object: object, path = "profile") => {
    const record = object as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const rule = PARAMETER_UNITS[key];
      if (path === "profile.geometry" || (path === "profile" && (key === "mass" || key === "kYaw"))) continue;
      if (typeof value === "number" && rule) record[key] = clampValue(value, rule.min, rule.max, `${path}.${key}`);
      else if (value && typeof value === "object") constrain(value, `${path}.${key}`);
    }
  };
  constrain(profile);
  profile.drift.fullSpeed = clampValue(profile.drift.fullSpeed, 0.1, profile.power.maxSpeed, "profile.drift.fullSpeed");
  profile.drift.minSpeed = clampValue(profile.drift.minSpeed, 0, Math.max(0, profile.drift.fullSpeed - 0.01), "profile.drift.minSpeed");
  const invalid = validateProfile(profile);
  if (invalid.length) throw new Error(`compose: ${invalid.join("; ")}`);
  validateDrivetrain({ engine, gearbox, wheelRadius: profile.wheels.radius });
  const resources = resourceBudget(loadout);
  resources.capacity = components.reduce((sum, c) => sum + (c.definition.battery?.capacity ?? 0) * (c.performance > 0 ? 1 : 0), 0);
  resources.maxOutput = components.reduce((sum, c) => sum + (c.definition.battery?.maxOutput ?? 0) * c.performance, 0);
  resources.rechargeRate = components.reduce((sum, c) => sum + (c.definition.battery?.rechargeRate ?? 0) * c.performance, 0);
  resources.fuelCapacity = components.reduce((sum, c) => sum + (c.definition.fuelCapacity ?? 0) * (c.performance > 0 ? 1 : 0), 0);
  resources.powerDraw = components.reduce((sum, c) => sum + c.definition.powerDraw * (c.performance > 0 ? 1 : 0), 0);
  resources.ammo = {};
  for (const c of components) if (c.performance > 0) for (const [kind, amount] of Object.entries(c.definition.ammo ?? {})) resources.ammo[kind] = (resources.ammo[kind] ?? 0) + amount;
  resources.powerSufficient = resources.powerDraw <= resources.maxOutput;
  const driver = components.find(c => c.definition.seat === "driver" && c.performance > 0);
  const issues: string[] = [];
  const unavailable = (name: string, installed: boolean) => issues.push(installed
    ? `${name}已安装但已毁坏（耐久为0），请维修或更换`
    : `缺少可用${name}`);
  if (!driver) unavailable("驾驶座", components.some(c => c.definition.seat === "driver"));
  if (!engine) unavailable("发动机", components.some(c => !!c.definition.engine));
  if (!gearbox) unavailable("变速箱", components.some(c => !!c.definition.gearbox));
  if (resources.fuelCapacity <= 0) unavailable("油箱", components.some(c => (c.definition.fuelCapacity ?? 0) > 0));
  const frontX = Math.max(...chassis.layers.inner.map(c => c.x)) * chassis.cellSize;
  const limitedVision = !!driver && driver.x < frontX * 0.5 && !components.some(c => c.definition.tags.includes("vision") && c.performance > 0);
  const boosts = components.filter(c => c.definition.boost && c.performance > 0);
  const thrusters = boosts.map(c => ({ id: c.part.instanceId, point: { x: c.x - centerOfMass.x, y: c.y - centerOfMass.y },
    direction: { x: Math.cos(c.part.facing * Math.PI / 180), y: Math.sin(c.part.facing * Math.PI / 180) },
    parameters: { ...c.definition.boost!, force: c.definition.boost!.force * c.performance } }));
  const boost = { force: boosts.reduce((sum, c) => sum + c.definition.boost!.force * c.performance, 0),
    duration: Math.max(0, ...boosts.map(c => c.definition.boost!.duration)),
    cooldown: Math.max(0, ...boosts.map(c => c.definition.boost!.cooldown)),
    energy: boosts.reduce((sum, c) => sum + c.definition.boost!.energy, 0) };
  const d = derived(profile);
  const summary = { massKg: profile.mass * KG_PER_GAME_MASS, centerOfMass: { ...centerOfMass },
    frontLoadRatio: profile.geometry.cgFromRear, rearLoadRatio: 1 - profile.geometry.cgFromRear,
    powerToMass: (engine?.maxPower ?? 0) / profile.mass, estimatedMaxSpeed: profile.power.maxSpeed,
    gripRating: (profile.tires.front.muY + profile.tires.rear.muY) / 2,
    turningRating: Math.tan(profile.steering.maxAngle) / profile.geometry.wheelbase,
    massLimitKg: evaluate(chassis.maxMassKg, "massLimit"), overloaded: profile.mass * KG_PER_GAME_MASS > evaluate(chassis.maxMassKg, "massLimit"),
    canDrive: issues.length === 0, canControl: !!driver, limitedVision, issues, resources, clamped,
    inertia: d.inertia };
  return { loadout, profile, centerOfMass, inertia: d.inertia, summary, resources, engine, gearbox, boost,
    thrusters, auxiliaryPower: components.reduce((n, c) => n + (c.performance > 0 && !c.definition.weaponId && !c.definition.boost ? c.definition.powerDraw : 0), 0),
    mounts: mounts(loadout).map(mount => ({ ...mount, position: { x: mount.position.x - centerOfMass.x, y: mount.position.y - centerOfMass.y } })),
    components, modifiers };
}
export type Composition = ReturnType<typeof compose>;
