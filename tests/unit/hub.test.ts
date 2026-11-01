import { describe, expect, it } from "vitest";
import { advanceParking, emptyParking, STATIONS, type ParkingState } from "../../src/modes/hub/stations";
import { IDLE } from "../../src/vehicle/physics/state";
const position = { x: -11, y: 13 };
function hold(state = emptyParking(), steps = 84, speed = 0, input = IDLE) {
  let entered = 0;
  for (let i = 0; i < steps; i++) { const result = advanceParking(state, position, speed, input, 1 / 120); state = result.state; if (result.entered) entered++; }
  return { state, entered };
}
describe("营地停车交互", () => {
  it("原地旋转无法停车交互，横摆打断原有计时", () => {
    let state = hold(emptyParking(), 70).state;
    for (let i = 0; i < 120; i++) {
      const result = advanceParking(state, position, 0, IDLE, 1 / 120, 1);
      expect(result.entered).toBeNull(); expect(result.state.elapsed).toBe(0); state = result.state;
    }
    expect(hold(state, 83).entered).toBe(0);
  });
  it("0.7 秒停稳只触发一次，关闭留在区域不重开", () => {
    const before = hold(emptyParking(), 83); expect(before.entered).toBe(0);
    const result = advanceParking(before.state, position, 0, IDLE, 1 / 120);
    expect(result.entered?.id).toBe("equipment"); expect(hold(result.state, 240).entered).toBe(0);
  });
  it("高速经过、持续输入或尚未松开摇杆均不触发", () => {
    expect(hold(emptyParking(), 240, 2).entered).toBe(0);
    expect(hold(emptyParking(), 240, 0, { targetSpeed: 1, angle: null, drift: false }).entered).toBe(0);
    expect(hold(emptyParking(), 240, 0, { targetSpeed: 0, angle: 0, drift: false }).entered).toBe(0);
  });
  it("移动或离区打断累计，不继承停车时间", () => {
    for (const [pos, speed] of [[position, 0.16], [{ x: -11, y: 16 }, 0]] as const) {
      const before = hold(emptyParking(), 70).state;
      const interrupted = advanceParking(before, pos, speed, IDLE, 1 / 120).state;
      expect(interrupted.elapsed).toBe(0); expect(hold(interrupted, 83).entered).toBe(0);
    }
  });
  it("离开扩展边界后才解锁，重新停车可再次进入", () => {
    let state: ParkingState = hold().state;
    state = advanceParking(state, { x: -11, y: 14.6 }, 0, IDLE, 1 / 120).state;
    expect(hold(state).entered).toBe(0);
    state = advanceParking(state, { x: -11, y: 15 }, 0, IDLE, 1 / 120).state;
    expect(hold(state).entered).toBe(1);
  });
  it("三处功能区互不重叠，驶入其他区域重新计时", () => {
    expect(STATIONS).toHaveLength(3);
    const before = hold(emptyParking(), 70).state;
    const next = advanceParking(before, { x: -15, y: 13 }, 0, IDLE, 1 / 120);
    expect(next.state.candidate).toBe("shop"); expect(next.state.elapsed).toBeCloseTo(1 / 120); expect(next.entered).toBeNull();
  });
});
