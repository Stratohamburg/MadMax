# Proposal

## Why

改装必须真实影响驾驶：武器和部件的重量与摆放位置改变整车质量、质心和转动惯量，动力、轮胎和喷射系统改变驱动与抓地。物理核心当前只接收固定车型 profile，需要一条从装配清单到物理参数的确定性派生管线，并补足质心偏移。

## What Changes

- 新增 `compose`：由底盘 + 装配清单派生物理 profile（总质量、质心、转动惯量、前后轴荷、轮胎抓地与刚度，以及动力链参数）。
- 选择发动机、变速箱、轮胎与助推部件，将健康与加成映射为 vehicle-physics 核心定义的机械参数。
- 质量、二维质心与惯量严格派生；核心不支持的装配明确报错，保留一致挂点与摘要。
- 装配驾驶负责供给和单指策略编排，调用核心动力链、助推与质量变化迁移。
- 新增装配性能摘要（供改装 UI 实时显示）。
- **BREAKING**：采用核心的 `vehicle-profile-4`/`vehicle-physics-4`，沿用"不静默兼容旧版本"的原则；v2 证据保留为历史。

## Capabilities

### New Capabilities

- `assembly-physics`：装配到物理参数的派生规则、质心与惯量计算、动力链与喷射部件参数派生、供给与运行接入、性能摘要。

### Modified Capabilities

- `vehicle-physics`：来自 `build-vehicle-physics` 变更（未归档）；发动机、变速箱、质心几何、质量迁移和外力合同集中修订在该核心变更，本变更只引用它。

## Impact

修改 `src/vehicle/physics` 的 profile、几何与力矩计算，新增 `src/loadout/compose`，更新基准/审计脚本与回放哈希。依赖 `add-vehicle-loadout-grid`。风险集中在回放基准重新验收。
