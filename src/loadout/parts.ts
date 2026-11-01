import type { PartDefinition } from "./types";

const single = [{ x: 0, y: 0 }];
const pair = [...single, { x: 1, y: 0 }];
const square = [...pair, { x: 0, y: 1 }, { x: 1, y: 1 }];
const base = (id: string, name: string, massKg: number, tags: string[]): PartDefinition => ({
  id, name, layer: "inner", shape: single, rotations: [0, 90, 180, 270],
  slots: ["internal"], maxCount: 8, massKg, hp: 100, powerDraw: 0, tags, exposed: false,
});
const weapon = (id: string, name: string, mass: number, tags: string[], powerDraw = 0): PartDefinition => ({
  ...base(id, name, mass, ["weapon", ...tags]), layer: "outer", slots: ["roof", "edge"],
  exposed: true, weaponId: id, powerDraw,
});
const definitions: PartDefinition[] = [
  { ...base("engine-l4", "L4 发动机", 110, ["engine", "power"]), shape: square, maxCount: 1,
    engine: { idleRpm: 800, redlineRpm: 7000, maxPower: 170, maxTorque: 240,
      torqueCurve: [[800, 0.5], [2500, 0.85], [4500, 1], [7000, 0.65]], fuelConsumption: 0.012 } },
  { ...base("engine-diesel", "低转柴油机", 320, ["engine", "power"]), shape: square, maxCount: 1,
    engine: { idleRpm: 600, redlineRpm: 3500, maxPower: 260, maxTorque: 1300,
      torqueCurve: [[600, 0.75], [1200, 1], [2200, 0.95], [3500, 0.55]], fuelConsumption: 0.02 } },
  { ...base("gearbox", "六挡自动变速箱", 65, ["gearbox"]), shape: pair, maxCount: 1,
    gearbox: { ratios: [3.6, 2.3, 1.55, 1.15, 0.9, 0.72], finalDrive: 4.1,
      shiftTime: 0.22, efficiency: 0.92, maxInputTorque: 400 } },
  { ...base("gearbox-heavy", "八挡重载变速箱", 160, ["gearbox"]), shape: pair, maxCount: 1,
    gearbox: { ratios: [8, 5.4, 3.7, 2.5, 1.8, 1.3, 1, 0.75], finalDrive: 4.8,
      shiftTime: 0.35, efficiency: 0.9, maxInputTorque: 1600 } },
  { ...base("battery", "蓄电池", 30, ["battery", "electric"]),
    battery: { capacity: 120, maxOutput: 60, rechargeRate: 12 } },
  { ...base("fuel-tank", "油箱", 45, ["fuel"]), fuelCapacity: 40 },
  { ...base("driver-seat", "驾驶座", 20, ["seat", "driver"]), seat: "driver", maxCount: 1 },
  { ...base("passenger-seat", "乘员座", 18, ["seat", "passenger"]), seat: "passenger" },
  { ...base("mechanic", "随行机械师", 85, ["seat", "repair"]), seat: "mechanic", maxCount: 1 },
  { ...base("inner-armor", "内装甲", 80, ["armor"]), hp: 240 },
  { ...base("ammo-box", "共用弹药箱", 35, ["ammo"]), ammo: { ballistic: 400, rocket: 12 } },
  { ...base("tires", "越野轮胎组", 40, ["tire", "grip"]), maxCount: 1,
    tire: { grip: 1.08, stiffness: 1.05, loose: 1.1 } },
  { ...base("booster", "喷射助推器", 55, ["boost"]), layer: "outer", slots: ["edge"],
    exposed: true, boost: { force: 4, duration: 1.2, cooldown: 5, energy: 10 } },
  { ...base("radar", "雷达", 12, ["radar", "electric"]), layer: "outer", slots: ["roof"], exposed: true, powerDraw: 5 },
  { ...base("periscope", "潜望镜", 8, ["vision"]), layer: "outer", slots: ["roof"], exposed: true },
  { ...weapon("armor", "外挂装甲", 110, ["armor", "passive"]), weaponId: undefined, slots: ["edge"], hp: 300 },
  weapon("machine-gun", "机枪", 45, ["turret", "barrage"], 8),
  weapon("shotgun", "霰弹枪", 40, ["fixed", "barrage"]),
  weapon("rocket", "火箭发射器", 90, ["fixed", "explosive"]),
  weapon("cannon", "加农炮", 260, ["turret", "explosive"]),
  weapon("missile", "制导导弹", 100, ["guided", "explosive"], 18),
  weapon("flamethrower", "喷火器", 65, ["fixed", "fire"], 12),
  weapon("autocannon", "机炮", 130, ["turret", "barrage", "explosive"], 10),
  { ...weapon("spikes", "突刺", 50, ["passive", "collision"]), slots: ["edge"] },
  { ...weapon("reactive-armor", "反应装甲", 90, ["passive", "explosive"]), slots: ["edge"] },
];
export const PARTS: Readonly<Record<string, PartDefinition>> = Object.fromEntries(definitions.map(p => [p.id, p]));
