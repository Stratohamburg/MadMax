import { PRACTICE_AREAS, REGIONS, WORLD } from '../scene/world';
import { TRAIL_LIFETIME } from '../scene/trails';
import type { Trail } from '../scene/trails';
import type { VehicleProfile } from '../vehicle/physics/config';
import { derived } from '../vehicle/physics/config';
import { geometry } from '../vehicle/model';
import type { PhysicsState, Vec2 } from '../vehicle/model';
import type { Observation } from '../vehicle/physics/dynamics';

export class CanvasRenderer {
  camera: Vec2 & { rotation: number } = { x: -11, y: 19, rotation: 0 };
  private context: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) { this.context = canvas.getContext('2d')!; }
  reset(state: PhysicsState): void { this.camera = { x: state.position.x, y: state.position.y, rotation: 0 }; }

  render(previous: PhysicsState, current: PhysicsState, alpha: number, profile: VehicleProfile, trails: Trail[], time: number, validate: boolean, observation?: Observation): void {
    const ctx = this.context;
    const { width, height } = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    }
    const car = { x: previous.position.x + (current.position.x - previous.position.x) * alpha,
      y: previous.position.y + (current.position.y - previous.position.y) * alpha,
      theta: previous.theta + Math.atan2(Math.sin(current.theta - previous.theta), Math.cos(current.theta - previous.theta)) * alpha };
    this.camera = { x: car.x, y: car.y, rotation: 0 };
    const scale = height / 16;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#25332c'; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.translate(width / 2 - car.x * scale, height / 2 - car.y * scale); ctx.scale(scale, scale);
    const bounds = WORLD.bounds;
    ctx.fillStyle = '#344038'; ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    // 确定性地表纹理，不引入随绘制帧变化的随机状态。
    for (let x = -29; x < 30; x += 1.8) for (let y = -35; y < 30; y += 1.8) {
      const seed = Math.sin(x * 27 + y * 13);
      ctx.fillStyle = seed > 0 ? '#aeb28b0c' : '#101d1812';
      ctx.fillRect(x + seed * 0.4, y, 0.09, 0.14);
    }
    const road = new Path2D();
    road.moveTo(-11, 24); road.lineTo(-11, -12);
    road.bezierCurveTo(-11, -24, -5, -28, 5, -28);
    road.lineTo(14, -28); road.bezierCurveTo(21, -28, 21, -17, 15, -17);
    road.bezierCurveTo(5, -17, 5, -10, 13, -8);
    road.bezierCurveTo(23, -5, 20, 1, 12, 1);
    road.bezierCurveTo(4, 1, 5, 8, 14, 9);
    road.lineTo(17, 20);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#9b9670'; ctx.lineWidth = 6.3; ctx.stroke(road);
    ctx.strokeStyle = '#62685a'; ctx.lineWidth = 5.8; ctx.stroke(road);
    ctx.strokeStyle = '#d0c59b77'; ctx.lineWidth = 0.065; ctx.setLineDash([0.6, 0.65]); ctx.stroke(road); ctx.setLineDash([]);
    // 三类路面练习区：颜色只标识采样区域，动力学仍由核心 surface sampler 决定。
    ctx.fillStyle = '#8d9e9b22'; ctx.fillRect(-18, -30, 12, 7);
    ctx.fillStyle = '#b19b6826'; ctx.fillRect(9, -30, 13, 12);
    ctx.fillStyle = '#8c9fbd25'; ctx.fillRect(8, -10, 14, 12);
    ctx.fillStyle = '#d6ddc033'; ctx.font = '0.28px "Microsoft YaHei", sans-serif';
    ctx.fillText('松散地 · loose', -12, -27); ctx.fillText('湿滑地 · wet', 15, -27); ctx.fillText('干硬路 · dry-hard', 15, -7);
    // 起跑标线和屏幕上向北的固定参照。
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? '#d8d1ae' : '#283a30'; ctx.fillRect(-13.8 + i * 0.56, 20.4, 0.56, 0.28);
    }
    for (const region of REGIONS) {
      ctx.save(); ctx.translate(region.x, region.y);
      ctx.fillStyle = '#17271ed9'; ctx.fillRect(-2.6, -0.65, 5.2, 1.1);
      ctx.textAlign = 'center'; ctx.fillStyle = '#d8d4b4'; ctx.font = 'bold 0.43px "Microsoft YaHei", sans-serif'; ctx.fillText(region.name, 0, -0.12);
      ctx.fillStyle = '#adb898'; ctx.font = '0.24px "Microsoft YaHei", sans-serif'; ctx.fillText(region.hint, 0, 0.25);
      ctx.restore();
    }
    for (const area of PRACTICE_AREAS) {
      ctx.save(); ctx.translate(area.x, area.y); ctx.strokeStyle = '#d3c17d99'; ctx.lineWidth = 0.08; ctx.setLineDash([0.18, 0.16]);
      ctx.beginPath(); ctx.arc(0, 0, area.radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#17271ed9'; ctx.fillRect(-2.2, -0.33, 4.4, 0.65); ctx.textAlign = 'center'; ctx.fillStyle = '#ded6b6'; ctx.font = '0.25px "Microsoft YaHei", sans-serif'; ctx.fillText(area.name, 0, -0.04); ctx.fillStyle = '#aebc9d'; ctx.font = '0.18px "Microsoft YaHei", sans-serif'; ctx.fillText(area.hint, 0, 0.22); ctx.restore();
    }
    ctx.strokeStyle = '#b1a37b'; ctx.lineWidth = 0.2;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    for (const obstacle of WORLD.obstacles) {
      ctx.fillStyle = '#17241e88'; ctx.fillRect(obstacle.x + 0.15, obstacle.y + 0.22, obstacle.width, obstacle.height);
      ctx.fillStyle = '#998365'; ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.strokeStyle = '#c9b588'; ctx.lineWidth = 0.07; ctx.strokeRect(obstacle.x + 0.12, obstacle.y + 0.12, obstacle.width - 0.24, obstacle.height - 0.24);
      ctx.beginPath(); ctx.moveTo(obstacle.x + 0.15, obstacle.y + 0.15); ctx.lineTo(obstacle.x + obstacle.width - 0.15, obstacle.y + obstacle.height - 0.15); ctx.stroke();
    }
    for (const trail of trails) {
      ctx.strokeStyle = `rgba(15,22,17,${trail.intensity * Math.max(0, 1 - (time - trail.born) / TRAIL_LIFETIME) * 0.7})`;
      ctx.lineWidth = 0.075; ctx.beginPath(); ctx.moveTo(trail.from.x, trail.from.y); ctx.lineTo(trail.to.x, trail.to.y); ctx.stroke();
    }
    const currentGeometry = geometry(current, profile);
    const d = derived(profile);
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.theta);
    const length = currentGeometry.bodyLength;
    const bodyWidth = profile.geometry.width;
    const rear = -d.lr - profile.geometry.rearOverhang;
    ctx.fillStyle = '#101c17aa'; ctx.fillRect(rear + 0.1, -bodyWidth / 2 + 0.12, length, bodyWidth);
    ctx.fillStyle = '#131d18';
    for (const along of [d.lf, -d.lr]) for (const side of [-1, 1]) { ctx.save(); ctx.translate(along, side * profile.geometry.track / 2); ctx.rotate(along > 0 ? (side < 0 ? currentGeometry.wheelAngles.left : currentGeometry.wheelAngles.right) : 0); ctx.fillRect(-0.12, -0.06, 0.24, 0.12); ctx.restore(); }
    ctx.fillStyle = '#d6a35d'; ctx.fillRect(rear, -bodyWidth / 2, length, bodyWidth);
    ctx.fillStyle = '#efc47b'; ctx.fillRect(d.lf - length * 0.24, -bodyWidth * 0.43, length * 0.24, bodyWidth * 0.86);
    ctx.fillStyle = '#233a34'; ctx.fillRect(-length * 0.03 + rear, -bodyWidth * 0.39, length * 0.2, bodyWidth * 0.78);
    ctx.fillStyle = '#b2864f'; ctx.fillRect(rear + length * 0.11, -bodyWidth * 0.4, length * 0.25, bodyWidth * 0.8);
    ctx.fillStyle = '#f9e4b0'; ctx.fillRect(rear + length * 0.94, -bodyWidth * 0.42, 0.07, 0.15); ctx.fillRect(rear + length * 0.94, bodyWidth * 0.2, 0.07, 0.15);
    // 四轮在车身之上绘制，前轮旋转角来自同一核心 geometry/阿克曼结果。
    for (const [along, side, angle] of [[d.lf, -1, currentGeometry.wheelAngles.left], [d.lf, 1, currentGeometry.wheelAngles.right], [-d.lr, -1, 0], [-d.lr, 1, 0] ] as const) {
      ctx.save(); ctx.translate(along, side * profile.geometry.track / 2); ctx.rotate(angle); ctx.fillStyle = '#111a16'; ctx.fillRect(-0.15, -0.065, 0.3, 0.13); ctx.restore();
    }
    ctx.restore();
    if (validate) {
      const vectors = [{ angle: observation?.input.angle ?? null, color: '#e9c065', length: 2.7 }, { angle: current.theta, color: '#f2eece', length: 2.2 }, { angle: current.motion, color: '#6dd5be', length: 1.8 }];
      for (const vector of vectors) if (vector.angle !== null) {
        ctx.strokeStyle = vector.color; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(car.x, car.y);
        ctx.lineTo(car.x + Math.cos(vector.angle) * vector.length, car.y + Math.sin(vector.angle) * vector.length); ctx.stroke();
      }
    }
    ctx.restore();
    // 场地总览使三个小视口都能找到远处的练习区域。
    const mapWidth = Math.min(83, width * 0.23); const mapHeight = mapWidth * bounds.height / bounds.width;
    const mapX = width - mapWidth - 14; const mapY = 70;
    ctx.fillStyle = '#142019ce'; ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
    ctx.strokeStyle = '#b1b69766'; ctx.lineWidth = 1; ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);
    const mx = (x: number) => mapX + (x - bounds.x) / bounds.width * mapWidth;
    const my = (y: number) => mapY + (y - bounds.y) / bounds.height * mapHeight;
    ctx.save(); ctx.translate(mapX - bounds.x * mapWidth / bounds.width, mapY - bounds.y * mapWidth / bounds.width); ctx.scale(mapWidth / bounds.width, mapWidth / bounds.width);
    ctx.strokeStyle = '#8d9274'; ctx.lineWidth = 2; ctx.stroke(road); ctx.restore();
    ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
    REGIONS.forEach((region, i) => { ctx.fillStyle = '#d2c69a'; ctx.fillText(`${i + 1}`, mx(region.x), my(region.y)); });
    ctx.fillStyle = '#ffd58b'; ctx.beginPath(); ctx.arc(mx(car.x), my(car.y), 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cfdbb8'; ctx.font = '8px sans-serif'; ctx.fillText('北 ↑', width - 25, mapY - 8);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.22, width / 2, height / 2, height * 0.72);
    vignette.addColorStop(0, '#101b1600'); vignette.addColorStop(1, '#101b164d'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  }
}
