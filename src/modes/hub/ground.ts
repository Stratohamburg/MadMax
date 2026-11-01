import { STATIONS } from "./stations";
import type { ParkingState } from "./stations";

export function drawHub(ctx: CanvasRenderingContext2D, parking: ParkingState) {
  ctx.fillStyle = "#474e40"; ctx.fillRect(-17.1, 10.8, 12.2, 5.1);
  ctx.strokeStyle = "#b8b18c55"; ctx.lineWidth = 0.04;
  for (let x = -17; x < -5; x += 1) { ctx.beginPath(); ctx.moveTo(x, 10.8); ctx.lineTo(x, 15.9); ctx.stroke(); }
  for (const station of STATIONS) {
    const { x, y, color } = station;
    ctx.fillStyle = "#0b171877"; ctx.fillRect(x - 1.65 + 0.12, 7.9 + 0.2, 3.3, 3.1);
    ctx.fillStyle = station.id === "equipment" ? "#52675b" : station.id === "shop" ? "#74624b" : "#67524b";
    ctx.fillRect(x - 1.65, 7.9, 3.3, 3.1);
    ctx.strokeStyle = color; ctx.lineWidth = 0.05; ctx.strokeRect(x - 1.65, 7.9, 3.3, 3.1);
    ctx.strokeStyle = "#15231b70";
    for (let line = 0; line < 7; line++) { ctx.beginPath(); ctx.moveTo(x - 1.5, 8.1 + line * 0.34); ctx.lineTo(x + 1.5, 8.1 + line * 0.34); ctx.stroke(); }
    ctx.fillStyle = "#182b24"; ctx.fillRect(x - 1.45, 9.1, 2.9, 1.05);
    ctx.textAlign = "center"; ctx.font = 'bold .49px "Microsoft YaHei",sans-serif'; ctx.fillStyle = color; ctx.fillText(station.name, x, 9.75);
    ctx.fillStyle = "#17251d"; ctx.fillRect(x - 1.45, 10.5, 2.9, 0.55);
    ctx.font = '.23px "Microsoft YaHei",sans-serif'; ctx.fillStyle = "#e3d7b5"; ctx.fillText(station.subtitle, x, 10.87);
    ctx.fillStyle = color + "18"; ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
    ctx.strokeStyle = color; ctx.lineWidth = 0.065; ctx.setLineDash([0.24, 0.14]); ctx.strokeRect(x - 1.4, y - 1.4, 2.8, 2.8); ctx.setLineDash([]);
    ctx.font = 'bold .6px sans-serif'; ctx.fillStyle = color; ctx.fillText("P", x, y + 0.16);
    ctx.font = '.22px "Microsoft YaHei",sans-serif'; ctx.fillText("停稳进入", x, y + 0.72);
    if (parking.candidate === station.id) {
      ctx.strokeStyle = "#f7e7af"; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.arc(x, y, 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * parking.elapsed / 0.7); ctx.stroke();
    }
  }
  ctx.strokeStyle = "#d8d4a1aa"; ctx.lineWidth = 0.09;
  for (const x of [-15, -11, -7]) { ctx.beginPath(); ctx.moveTo(x, 16.4); ctx.lineTo(x, 15.8); ctx.moveTo(x - 0.2, 16.05); ctx.lineTo(x, 15.8); ctx.lineTo(x + 0.2, 16.05); ctx.stroke(); }
  ctx.fillStyle = "#ded6b1"; ctx.textAlign = "center"; ctx.font = '.3px "Microsoft YaHei",sans-serif'; ctx.fillText("前方营地 · 松手停稳进入", -11, 17.3);
}
