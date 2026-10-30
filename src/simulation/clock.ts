export const PHYSICS_STEP = 1 / 120;
export const MAX_BACKLOG = 0.1;

/** 时间单位为秒。cursor 追踪墙上时间，time 只累计实际模拟过的时间。 */
export class FixedClock {
  time = 0;
  steps = 0;
  private last: number | null = null;
  private cursor = 0;
  private accumulator = 0;
  private paused = false;

  get alpha(): number { return this.accumulator / PHYSICS_STEP; }

  advance(now: number, step: (dt: number, timestamp: number) => void): void {
    if (this.paused) return;
    if (this.last === null) { this.last = this.cursor = now; return; }
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    const backlog = this.accumulator + elapsed;
    const kept = Math.min(backlog, MAX_BACKLOG);
    this.cursor += backlog - kept;
    this.accumulator = kept;
    while (this.accumulator + 1e-10 >= PHYSICS_STEP) {
      step(PHYSICS_STEP, this.cursor);
      this.cursor += PHYSICS_STEP;
      this.time += PHYSICS_STEP;
      this.steps++;
      this.accumulator = Math.max(0, this.accumulator - PHYSICS_STEP);
    }
  }

  pause(): void { this.paused = true; this.accumulator = 0; this.last = null; }
  resume(now: number): void {
    this.paused = false;
    this.last = this.cursor = now;
    this.accumulator = 0;
  }
  reset(now: number): void { this.time = 0; this.steps = 0; this.resume(now); }
}

export class TimedInput<T> {
  private events: { timestamp: number; value: T }[] = [];
  constructor(private current: T) {}

  push(timestamp: number, value: T): void {
    this.events.push({ timestamp, value });
    this.events.sort((a, b) => a.timestamp - b.timestamp);
  }

  sample(timestamp: number): T {
    let consumed = 0;
    while (consumed < this.events.length && this.events[consumed].timestamp <= timestamp + 1e-10) {
      this.current = this.events[consumed++].value;
    }
    if (consumed) this.events.splice(0, consumed);
    return this.current;
  }

  clear(value: T): void { this.events = []; this.current = value; }
}
