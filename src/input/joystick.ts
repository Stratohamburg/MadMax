import { IDLE, clamp } from '../vehicle/model';
import type { Intent } from '../vehicle/model';
import type { VehicleConfig } from '../vehicle/config';
import type { VehicleProfile } from '../vehicle/physics/config';

export interface StickSample extends Intent { dx: number; dy: number; distance: number; throttle: number }
export interface StickGeometry { x: number; y: number; radius: number; enter: number; exit: number }

type StickConfig = VehicleConfig | VehicleProfile;
function maxSpeed(config: StickConfig): number { return 'modelVersion' in config ? config.power.maxSpeed : config.maxSpeed; }
function enterRatio(config: StickConfig): number { return 'modelVersion' in config ? 1.4 : config.enterRatio; }
function exitRatio(config: StickConfig): number { return 'modelVersion' in config ? 1.2 : config.exitRatio; }
export function mapStick(dx: number, dy: number, radius: number, wasDrifting: boolean, config: StickConfig): StickSample {
  const distance = Math.hypot(dx, dy);
  const throttle = clamp(distance / radius, 0, 1);
  const drift = distance === 0 ? false : wasDrifting ? distance > radius * exitRatio(config) : distance >= radius * enterRatio(config);
  return { dx, dy, distance, throttle, targetSpeed: maxSpeed(config) * throttle,
    angle: distance === 0 ? null : Math.atan2(dy, dx), drift };
}

export class Joystick {
  activeId: number | null = null;
  value: StickSample = { ...IDLE, dx: 0, dy: 0, distance: 0, throttle: 0 };
  geometry: StickGeometry = { x: 0, y: 0, radius: 1, enter: 1.4, exit: 1.2 };
  constructor(private element: HTMLElement, private config: () => StickConfig,
    private changed: (value: StickSample, timestamp: number) => void) {
    element.addEventListener('pointerdown', event => {
      if (this.activeId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      this.activeId = event.pointerId;
      element.setPointerCapture(event.pointerId);
      this.update(event);
    });
    element.addEventListener('pointermove', event => {
      if (event.pointerId !== this.activeId) return;
      event.preventDefault();
      this.update(event);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(name, event => {
        if ((event as PointerEvent).pointerId === this.activeId) this.clear();
      });
    }
    element.addEventListener('contextmenu', event => event.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(element);
    this.resize();
  }

  resize(): void {
    this.clear();
    const rect = this.element.getBoundingClientRect();
    const enter = Math.max(1, Math.min(rect.width, rect.height) / 2 - 15);
    const radius = enter / enterRatio(this.config());
    this.geometry = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      radius, enter, exit: radius * exitRatio(this.config()) };
    this.element.style.setProperty('--enter-diameter', `${enter * 2}px`);
    this.element.style.setProperty('--normal-diameter', `${radius * 2}px`);
    this.element.style.setProperty('--exit-diameter', `${this.geometry.exit * 2}px`);
  }

  clear(): void {
    const previous = this.activeId;
    this.activeId = null;
    if (previous !== null && this.element.hasPointerCapture(previous)) this.element.releasePointerCapture(previous);
    this.value = { ...IDLE, dx: 0, dy: 0, distance: 0, throttle: 0 };
    this.feedback();
    this.changed(this.value, performance.now() / 1000);
  }

  private update(event: PointerEvent): void {
    this.value = mapStick(event.clientX - this.geometry.x, event.clientY - this.geometry.y,
      this.geometry.radius, this.value.drift, this.config());
    this.feedback();
    const stamp = event.timeStamp > 1e12 ? event.timeStamp - performance.timeOrigin : event.timeStamp;
    this.changed(this.value, stamp / 1000);
  }

  private feedback(): void {
    const scale = this.value.distance === 0 ? 0 : Math.min(1, this.geometry.enter / this.value.distance);
    this.element.style.setProperty('--thumb-x', `${this.value.dx * scale}px`);
    this.element.style.setProperty('--thumb-y', `${this.value.dy * scale}px`);
    this.element.dataset.mode = this.value.drift ? 'drift' : this.value.throttle === 1 ? 'full' : 'normal';
    this.element.setAttribute('aria-valuenow', `${Math.round(this.value.throttle * 100)}`);
    this.element.setAttribute('aria-valuetext', `${Math.round(this.value.throttle * 100)}% ${this.value.drift ? '漂移' : '普通'}`);
  }
}
