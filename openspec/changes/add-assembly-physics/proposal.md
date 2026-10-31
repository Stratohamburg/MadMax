# Proposal

## Why

改装必须真实影响驾驶：武器和部件的重量与摆放位置改变整车质量、质心和转动惯量，动力、轮胎和喷射系统改变驱动与抓地。物理核心当前只接收固定车型 profile，需要一条从装配清单到物理参数的确定性派生管线，并补足质心偏移。

## What Changes

- 新增 `compose`：由底盘 + 装配清单派生物理 profile（总质量、质心、转动惯量、前后轴荷、动力、制动、最高速、轮胎抓地与刚度）。
- 物理核心支持质心不在几何中心：轴距分配与碰撞几何由质心派生。
- 新增喷射系统等"额外执行器"：有限推力、持续时间与冷却，由控制层触发，不改变物理定律。
- 新增装配性能摘要（供改装 UI 实时显示）。
- **BREAKING**：新增 `vehicle-profile-3`/`vehicle-physics-3`，沿用"不静默兼容旧版本"的原则；v2 证据保留为历史。

## Capabilities

### New Capabilities

- `assembly-physics`：装配到物理参数的派生规则、质心与惯量计算、额外执行器（喷射）、性能摘要。

### Modified Capabilities

- `vehicle-physics`：来自 `build-vehicle-physics` 变更（未归档）；本变更对其增加质心偏移合同，需在该变更归档后同步，或作为其后续修订。

## Impact

修改 `src/vehicle/physics` 的 profile、几何与力矩计算，新增 `src/loadout/compose`，更新基准/审计脚本与回放哈希。依赖 `add-vehicle-loadout-grid`。风险集中在回放基准重新验收。
