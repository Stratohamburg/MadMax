import type { CombatEvent } from "../combat/world";
export interface DamageLabel { targetId: number; kind: string; amount: number; x: number; y: number; born: number; bucket: number }
export class DamageLabels {
  readonly labels: DamageLabel[] = [];
  constructor(readonly capacity = 24, readonly lifetime = 0.8) {}
  ingest(events: readonly CombatEvent[], time: number): void {
    this.expire(time);
    for (const event of events) if (event.type === "damage" && event.amount > 0) {
      const bucket = Math.floor(time / 0.2), old = this.labels.find(l => l.targetId === event.targetId && l.kind === event.kind && l.bucket === bucket);
      if (old) old.amount += event.amount;
      else { if (this.labels.length >= this.capacity) this.labels.shift(); this.labels.push({ targetId: event.targetId, kind: event.kind, amount: event.amount, x: event.position.x, y: event.position.y, born: time, bucket }); }
    }
  }
  expire(time: number): void { for (let i = this.labels.length - 1; i >= 0; i--) if (time - this.labels[i].born > this.lifetime) this.labels.splice(i, 1); }
  render(ctx: CanvasRenderingContext2D, time: number, center: { x: number; y: number }, clearRadius: number): void {
    this.expire(time); ctx.save(); ctx.font = 'bold 0.28px "Microsoft YaHei",sans-serif'; ctx.textAlign = "center";
    for (const label of this.labels) {
      const y = label.y - 0.5 - (time - label.born) * 0.4;
      if (Math.hypot(label.x - center.x, y - center.y) <= clearRadius + 0.4) continue;
      ctx.globalAlpha = Math.max(0, 1 - (time - label.born) / this.lifetime); ctx.fillStyle = label.kind === "fire" ? "#ffc17b" : "#f8e0ab";
      ctx.fillText(String(Math.round(label.amount)), label.x, y);
    } ctx.restore();
  }
}
