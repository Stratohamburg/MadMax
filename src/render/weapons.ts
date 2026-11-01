import type { WeaponVisual } from "../combat/weapons/types";
import type { Vec2 } from "../vehicle/physics/math";
/** 所有武器提示共享一个净空裁切，包括扇形边缘和目标准星。 */
export function renderWeapons(ctx: CanvasRenderingContext2D, visuals: readonly WeaponVisual[], center?: Vec2, margin = 0): void {
  for (const visual of visuals) {
    const clearCenter = center ?? visual.clearCenter, clearRadius = visual.clearRadius + margin;
    ctx.save(); ctx.beginPath(); ctx.rect(-10000, -10000, 20000, 20000);
    ctx.arc(clearCenter.x, clearCenter.y, clearRadius, 0, Math.PI * 2); ctx.clip("evenodd");
    const start = visual.baseAngle - visual.arc / 2, end = visual.baseAngle + visual.arc / 2;
    ctx.fillStyle = visual.overheated ? "#f3a05e0b" : "#a7e3bb08";
    ctx.beginPath(); ctx.moveTo(visual.origin.x, visual.origin.y); ctx.arc(visual.origin.x, visual.origin.y, visual.range, start, end); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#b4d8b13b"; ctx.lineWidth = 0.025; ctx.stroke();
    ctx.strokeStyle = "#d8e7c999"; ctx.lineWidth = .014;
    ctx.beginPath(); ctx.moveTo(visual.origin.x, visual.origin.y);
    ctx.lineTo(visual.origin.x + Math.cos(visual.aimAngle) * visual.range, visual.origin.y + Math.sin(visual.aimAngle) * visual.range); ctx.stroke();
    ctx.strokeStyle = visual.overheated ? "#fa886c" : "#c9ddb999"; ctx.lineWidth = 0.045;
    ctx.beginPath(); ctx.arc(visual.origin.x, visual.origin.y, visual.range, start, start + visual.arc * visual.rimProgress); ctx.stroke();
    if (visual.heatProgress > 0) {
      ctx.strokeStyle = "#f1b569bb"; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.arc(visual.origin.x, visual.origin.y, visual.range + 0.09, start, start + visual.arc * visual.heatProgress); ctx.stroke();
    }
    if (visual.target && Math.hypot(visual.target.x - clearCenter.x, visual.target.y - clearCenter.y) > clearRadius + 0.2) {
      ctx.strokeStyle = visual.lockProgress >= 1 ? "#efb96d" : "#d4e2b77a"; ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.arc(visual.target.x, visual.target.y, 0.18, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}
