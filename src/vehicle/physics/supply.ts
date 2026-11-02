export interface PowerBudget { remainingPower: number; energy: number; dt: number; consumed: number }
export function powerBudget(energy: number, maxOutput: number, dt: number): PowerBudget {
  if (![energy, maxOutput, dt].every(Number.isFinite) || energy < 0 || maxOutput < 0 || dt <= 0)
    throw new Error("supply: 非法供给");
  return { energy, remainingPower: maxOutput, dt, consumed: 0 };
}
/** 每个消费者必须从同一预算扣取；短时执行器只申请本步实际需要的能量。 */
export function consumePower(budget: PowerBudget, requestedEnergy: number) {
  if (!Number.isFinite(requestedEnergy) || requestedEnergy < 0) throw new Error("supply: 非法需求");
  const granted = Math.min(requestedEnergy, budget.energy, budget.remainingPower * budget.dt);
  return { granted, budget: { ...budget, energy: Math.max(0, budget.energy - granted),
    remainingPower: Math.max(0, budget.remainingPower - granted / budget.dt), consumed: budget.consumed + granted } };
}
