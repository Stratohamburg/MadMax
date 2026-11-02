import { compose } from "../loadout/compose";
import { stockLoadout } from "../loadout/presets";
import { advanceAssemblyDrive, createAssemblyDrive } from "../vehicle/assembly-drive";
import type { AssemblyDriveState } from "../vehicle/assembly-drive";
import type { EnemyDefinition } from "./enemies";

const profileFor = (definition: EnemyDefinition) =>
  definition.id === "iron-warlord" ? "heavy-truck" : definition.id === "armored-car" ? "heavy-pickup" : "light-pickup";
const compositions = new Map<string, ReturnType<typeof compose>>();
export const enemyComposition = (definition: EnemyDefinition) => {
  let composition = compositions.get(definition.id);
  if (!composition) {
    const stock = stockLoadout(profileFor(definition));
    composition = compose({ ...stock, parts: [...stock.parts.filter(p => p.partId !== "machine-gun"),
      { instanceId: "enemy-gun", partId: definition.weaponId, layer: "outer", x: 0, y: 0, rotation: 0, facing: 0 }] });
    compositions.set(definition.id, composition);
  }
  return composition;
};

/** 敌方车辆 AI 只生成意图；车辆运动使用与玩家相同的控制和轮胎核心。 */
export function advanceEnemyVehicle(previous: AssemblyDriveState | undefined, definition: EnemyDefinition,
  position: { x: number; y: number }, velocity: { x: number; y: number }, theta: number,
  target: { x: number; y: number }, dt = 1 / 120) {
  if (dt !== 1 / 120) throw new Error("enemy vehicle: 固定步长必须为 1/120 秒");
  const composition = enemyComposition(definition), profile = composition.profile;
  const state = previous ?? createAssemblyDrive(composition, { position, worldVelocity: velocity, theta });
  const angle = Math.atan2(target.y - state.vehicle.position.y, target.x - state.vehicle.position.x);
  const distance = Math.hypot(target.x - state.vehicle.position.x, target.y - state.vehicle.position.y);
  const targetSpeed = distance > definition.stopDistance ? Math.min(profile.power.maxSpeed, definition.speed) : 0;
  return advanceAssemblyDrive(state, { targetSpeed, angle, drift: false, boost: false }, composition);
}
