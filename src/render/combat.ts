import { WEAPON_DESIGNS } from "../combat/weapons/presentation";
import { ENEMIES } from "../combat/enemies";
import type { WeaponVisual } from "../combat/weapons/types";
import type { CombatWorld } from "../combat/world";
import type { PresentationEvent } from "../combat/presentation-events";
import type { Vec2 } from "../vehicle/physics/math";

const paths = new Map<string, Path2D>();
function path(value: string) { let p = paths.get(value); if (!p) { p = new Path2D(value); paths.set(value, p); } return p; }
export function renderWeaponBody(ctx: CanvasRenderingContext2D, weaponId: string, origin: Vec2, baseAngle: number, aimAngle: number, scale = 1) {
  const d = WEAPON_DESIGNS[weaponId]; if (!d) return;
  ctx.save(); ctx.translate(origin.x, origin.y); ctx.scale(d.scale * scale, d.scale * scale);
  ctx.save(); ctx.rotate(baseAngle); ctx.fillStyle = "#172720"; ctx.strokeStyle = "#a2ae91"; ctx.lineWidth = .07;
  ctx.fill(path(d.base)); ctx.stroke(path(d.base)); ctx.restore();
  ctx.rotate(aimAngle); ctx.fillStyle = d.color; ctx.strokeStyle = "#e0d9b0"; ctx.lineWidth = .07;
  ctx.fill(path(d.moving)); ctx.stroke(path(d.moving)); ctx.strokeStyle = "#e9c691"; ctx.lineWidth = .045; ctx.stroke(path(d.detail)); ctx.restore();
}
/** 挂点位移随车辆插值；炮台角来自权威状态，不由渲染追踪目标。 */
export function renderMountedWeapons(ctx: CanvasRenderingContext2D, visuals: readonly WeaponVisual[], offset: Vec2 = { x: 0, y: 0 }) {
  for (const v of visuals) if (v.weaponId) renderWeaponBody(ctx, v.weaponId, { x: v.origin.x + offset.x, y: v.origin.y + offset.y }, v.baseAngle, v.aimAngle);
}
export function renderEnemies(ctx: CanvasRenderingContext2D, world: CombatWorld) {
  const p = world.entities;
  for (let i = 0; i < p.capacity; i++) if (p.active[i] && p.faction[i] === 1) {
    const d = ENEMIES[p.archetype[i]], radius = p.radius[i], kind = d?.kind ?? "infantry";
    ctx.save(); ctx.translate(p.x[i], p.y[i]); ctx.rotate(p.theta[i]);
    ctx.fillStyle = "#09130d70"; ctx.fillRect(-radius + .07, -radius * .7 + .08, radius * 2, radius * 1.4);
    if (kind === "vehicle") {
      ctx.fillStyle = "#131e18";
      for (const along of [-.6, .6]) for (const side of [-1, 1]) ctx.fillRect(radius * along - .12, radius * side * .55 - .06, .24, .12);
      ctx.fillStyle = d.color; ctx.strokeStyle = "#c9bb95"; ctx.lineWidth = .035;
      ctx.beginPath(); ctx.roundRect(-radius, -radius * .55, radius * 2, radius * 1.1, .1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#263d37"; ctx.fillRect(radius * .1, -radius * .45, radius * .4, radius * .9);
      ctx.fillStyle = "#d4bb88"; ctx.fillRect(radius * .85, -radius * .45, .06, radius * .9);
      if (d.id === "iron-warlord") { ctx.strokeStyle = "#c6a87a"; ctx.strokeRect(-radius * .85, -radius * .44, radius * .6, radius * .88); }
    } else if (kind === "building") {
      ctx.fillStyle = d.color; ctx.strokeStyle = "#c4b997"; ctx.lineWidth = .07;
      ctx.beginPath(); ctx.roundRect(-radius, -radius * .85, radius * 2, radius * 1.7, .1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#333b32"; ctx.fillRect(radius * .5, -radius * .64, radius * .5, radius * 1.28);
      ctx.strokeStyle = "#655f4e"; ctx.lineWidth = .04;
      ctx.beginPath(); ctx.moveTo(-radius, 0); ctx.lineTo(-radius * .5, 0); ctx.moveTo(0, -radius * .85); ctx.lineTo(0, -radius * .4); ctx.stroke();
    } else {
      ctx.strokeStyle = "#333c2d"; ctx.lineWidth = .09; ctx.beginPath(); ctx.moveTo(-.12, -.1); ctx.lineTo(-.2, -.13); ctx.moveTo(-.12, .1); ctx.lineTo(-.2, .13); ctx.stroke();
      ctx.fillStyle = d?.color ?? "#a08f63"; ctx.beginPath(); ctx.ellipse(-.03, 0, .13, .19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ddbc92"; ctx.beginPath(); ctx.arc(.07, 0, .1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6c7353"; ctx.beginPath(); ctx.arc(.07, 0, .08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const visual = world.enemyVisuals.find(v => v.instanceId === `enemy:${p.id[i]}`);
    if (visual && d) renderWeaponBody(ctx, d.weaponId, visual.origin, visual.baseAngle, visual.aimAngle);
    ctx.fillStyle = "#10231bc9"; ctx.fillRect(p.x[i] - .32, p.y[i] - radius - .2, .64, .06);
    ctx.fillStyle = kind === "building" ? "#cdbd91" : "#df9575"; ctx.fillRect(p.x[i] - .32, p.y[i] - radius - .2, .64 * p.hp[i] / p.maxHp[i], .06);
  }
}
export function renderProjectiles(ctx: CanvasRenderingContext2D, world: CombatWorld) {
  const b = world.projectiles;
  for (let i = 0; i < b.capacity; i++) if (b.active[i]) {
    const payload = b.payload[i]!, d = WEAPON_DESIGNS[payload.weaponId ?? "machine-gun"];
    if (!d || d.projectile === "pulse") continue;
    const distance = Math.max(0, (payload.lifetime - b.life[i]) * payload.speed), trail = Math.min(distance, d.trail);
    ctx.save(); ctx.translate(b.x[i], b.y[i]); ctx.rotate(b.angle[i]);
    ctx.lineCap = "round";
    const gradient = ctx.createLinearGradient(-Math.max(.01, trail), 0, 0, 0);
    gradient.addColorStop(0, "#00000000"); gradient.addColorStop(1, b.faction[i] ? "#ff9f75bb" : d.projectileColor);
    ctx.strokeStyle = gradient; ctx.lineWidth = d.width;
    ctx.beginPath(); ctx.moveTo(-trail, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = d.projectileColor; ctx.strokeStyle = b.faction[i] ? "#fb826c" : "#fff0bd"; ctx.lineWidth = .025;
    if (d.projectile === "rocket") {
      ctx.fillStyle = "#dad9b2"; ctx.beginPath(); ctx.moveTo(.11, 0); ctx.lineTo(-.08, -.05); ctx.lineTo(-.08, .05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffbb66"; ctx.beginPath(); ctx.moveTo(-.08, -.035); ctx.lineTo(-.2, 0); ctx.lineTo(-.08, .035); ctx.fill();
    } else if (d.projectile === "flame") {
      const r = .08 + Math.min(.16, distance * .045); ctx.globalAlpha = .7;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff0a1"; ctx.beginPath(); ctx.arc(0, 0, r * .45, 0, Math.PI * 2); ctx.fill();
    } else { ctx.beginPath(); ctx.ellipse(0, 0, d.projectile === "shell" ? .09 : .045, d.width, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
}
export class CombatEffects {
  readonly active: PresentationEvent[] = []; private lastSequence = -1;
  clear() { this.active.length = 0; this.lastSequence = -1; }
  ingest(events: readonly PresentationEvent[], now: number) {
    for (const event of events) if (event.sequence > this.lastSequence) {
      this.lastSequence = event.sequence;
      if (now - event.time < .8) { if (this.active.length >= 256) this.active.shift(); this.active.push(structuredClone(event)); }
    }
    while (this.active.length && now - this.active[0].time > .8) this.active.shift();
  }
  render(ctx: CanvasRenderingContext2D, now: number) {
    for (const event of this.active) {
      const age = now - event.time, d = WEAPON_DESIGNS[event.weaponId]; if (!d || age < 0) continue;
      const duration = event.type === "muzzle" ? .11 : event.type === "impact" ? .24 : .65;
      if (age > duration) continue;
      const t = age / duration;
      ctx.save(); ctx.translate(event.position.x, event.position.y); ctx.rotate(event.angle); ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = d.projectileColor; ctx.fillStyle = d.projectileColor; ctx.lineWidth = .035;
      if (event.type === "muzzle") {
        const size = d.flash * (1 - t * .6); ctx.beginPath();
        ctx.moveTo(-size * .2, -size * .3); ctx.lineTo(size * .55, -size * .6); ctx.lineTo(size * .3, -size * .14); ctx.lineTo(size * 1.4, 0); ctx.lineTo(size * .3, size * .14); ctx.lineTo(size * .55, size * .6); ctx.lineTo(-size * .2, size * .3); ctx.closePath(); ctx.fill();
      } else {
        const size = event.type === "impact" ? d.impact * .4 : Math.max(.25, event.size);
        if (event.type === "explosion" || event.type === "death") {
          ctx.fillStyle = "#e8a65544"; ctx.beginPath(); ctx.arc(0, 0, size * (.2 + t * .8), 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, size * (.2 + t * .8), 0, Math.PI * 2); ctx.stroke();
        }
        for (let i = 0; i < 7; i++) {
          const angle = i * Math.PI * 2 / 7 + event.sequence * .37, r = size * (.1 + t), end = r + size * .2 * (1 - t);
          ctx.beginPath(); ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); ctx.lineTo(Math.cos(angle) * end, Math.sin(angle) * end); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  snapshot() { return { active: this.active.length, lastSequence: this.lastSequence }; }
}
