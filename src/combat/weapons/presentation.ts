/** 同一矢量设计用于车库和战斗。局部 +x 为枪口方向，尺寸单位为游戏长度。 */
export interface WeaponDesign {
  name: string; description: string; base: string; moving: string; detail: string;
  color: string; scale: number; muzzle: number; projectile: "tracer" | "pellet" | "shell" | "rocket" | "flame" | "pulse";
  projectileColor: string; trail: number; width: number; flash: number; impact: number;
}
export const WEAPON_DESIGNS: Readonly<Record<string, WeaponDesign>> = {
  "machine-gun": { name: "机枪", description: "全周轻型炮台，持续弹幕，转向快", base: "M-.5,-.48H.4V.48H-.5Z", moving: "M-.42,-.25H.35V-.12H1.12V.12H.35V.25H-.42Z", detail: "M.45,-.1V.1M.65,-.1V.1M.85,-.1V.1M-.28,-.32V.32", color: "#82988c", scale: .18, muzzle: 1.12, projectile: "tracer", projectileColor: "#ffe7a5", trail: .58, width: .035, flash: .14, impact: .2 },
  shotgun: { name: "霰弹枪", description: "固定双管，近距锥形散射", base: "M-.6,-.4H.38V.4H-.6Z", moving: "M-.4,-.3H.85V-.08H-.1V.08H.85V.3H-.4Z", detail: "M.58,-.3V-.08M.58,.08V.3", color: "#ad8358", scale: .19, muzzle: .85, projectile: "pellet", projectileColor: "#f4d49d", trail: .26, width: .035, flash: .22, impact: .17 },
  rocket: { name: "火箭发射器", description: "固定重型发射筒，爆炸范围伤害", base: "M-.55,-.42H.4V.42H-.55Z", moving: "M-.7,-.26H.85V.26H-.7Z", detail: "M-.4,-.26V.26M.6,-.26V.26M-.3,0H.5", color: "#849161", scale: .23, muzzle: .85, projectile: "rocket", projectileColor: "#ffc16a", trail: 1.3, width: .075, flash: .32, impact: 1.5 },
  cannon: { name: "加农炮", description: "270°重炮台，慢转向、大后坐与高伤害", base: "M-.65,-.55H.5L.7,0L.5,.55H-.65Z", moving: "M-.5,-.38H.38V-.16H1.45V.16H.38V.38H-.5Z", detail: "M1.1,-.22H1.45V.22H1.1ZM-.3,-.24H.1V.24H-.3Z", color: "#a6a68a", scale: .25, muzzle: 1.45, projectile: "shell", projectileColor: "#ffe3a0", trail: .85, width: .075, flash: .42, impact: 1 },
  missile: { name: "制导导弹", description: "固定四联装，锁定后发射追踪导弹", base: "M-.65,-.5H.65V.5H-.65Z", moving: "M-.55,-.42H.8V-.25H-.55ZM-.55,-.2H.8V-.03H-.55ZM-.55,.03H.8V.2H-.55ZM-.55,.25H.8V.42H-.55Z", detail: "M.45,-.42V-.25M.45,-.2V-.03M.45,.03V.2M.45,.25V.42", color: "#758a83", scale: .23, muzzle: .8, projectile: "rocket", projectileColor: "#b5e7f0", trail: 1.5, width: .065, flash: .28, impact: 1.5 },
  flamethrower: { name: "喷火器", description: "固定燃料罐和喷嘴，近距持续燃烧", base: "M-.7,-.4H.1V.4H-.7Z", moving: "M-.45,-.24H.4L.9,-.1V.1L.4,.24H-.45Z", detail: "M-.5,-.35V.35M.1,-.2V.2M.45,-.15V.15", color: "#b08055", scale: .21, muzzle: .9, projectile: "flame", projectileColor: "#ffb452", trail: .48, width: .13, flash: .22, impact: .35 },
  autocannon: { name: "机炮", description: "180°双联炮台，中速转向与小范围爆炸", base: "M-.6,-.5H.5V.5H-.6Z", moving: "M-.45,-.34H.35V-.26H1.2V-.1H.2V.1H1.2V.26H.35V.34H-.45Z", detail: "M.85,-.26V-.1M.85,.1V.26M-.2,-.22V.22", color: "#879b9e", scale: .22, muzzle: 1.2, projectile: "shell", projectileColor: "#ffd289", trail: .7, width: .055, flash: .24, impact: .4 },
  spikes: { name: "突刺", description: "固定撞角，真实碰撞后触发近距伤害", base: "M-.5,-.5H.05V.5H-.5Z", moving: "M0,-.48L.85,-.32L0,-.16L1,0L0,.16L.85,.32L0,.48Z", detail: "M-.35,-.35V.35", color: "#aaa99a", scale: .22, muzzle: 0, projectile: "pulse", projectileColor: "#ded9bf", trail: 0, width: .06, flash: .2, impact: .6 },
  "reactive-armor": { name: "反应装甲", description: "固定爆反模块，受击触发范围爆炸", base: "M-.6,-.48H.6V.48H-.6Z", moving: "M-.5,-.35H-.08V.35H-.5ZM.08,-.35H.5V.35H.08Z", detail: "M-.4,-.2L-.18,.2M.18,-.2L.4,.2", color: "#9c8b67", scale: .23, muzzle: 0, projectile: "pulse", projectileColor: "#ffd68b", trail: 0, width: .08, flash: .35, impact: 1.5 },
};
export function muzzleOffset(weaponId: string): number { const d = WEAPON_DESIGNS[weaponId]; return d ? d.scale * d.muzzle : 0; }
export function weaponSvg(weaponId: string, facing = 0): string {
  const d = WEAPON_DESIGNS[weaponId]; if (!d) return "";
  return `<g transform="rotate(${facing - 90}) scale(.31)" stroke="#d8d4b7" stroke-width=".1" stroke-linejoin="round"><path d="${d.base}" fill="#273b34"/><path d="${d.moving}" fill="${d.color}"/><path d="${d.detail}" fill="none" stroke="#eddbac" stroke-width=".055"/></g>`;
}
