/** xorshift32；整数状态可直接进入存档与回放。 */
export const seedState = (seed: number): number => (seed >>> 0) || 0x9e3779b9;
export function nextRandom(seed: number): { state: number; value: number } {
  let state = seedState(seed);
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  state >>>= 0;
  return { state, value: state / 0x100000000 };
}
