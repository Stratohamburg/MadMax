# Proposal

## Why

改装必须真实影响驾驶：武器和部件的重量与摆放位置改变整车质量、质心和转动惯量，动力、轮胎和喷射系统改变驱动与抓地。物理核心当前只接收固定车型 profile，需要一条从装配清单到物理参数的确定性派生管线，并补足质心偏移。

## What Changes

- 新增 `compose`：由底盘 + 装配清单派生物理 profile（总质量、质心、转动惯量、前后轴荷、轮胎抓地与刚度，以及动力链参数）。
- 选择发动机、变速箱、轮胎与助推部件，将健康与加成映射为 vehicle-physics 核心定义的机械参数。
- 质量、二维质心与惯量严格派生；核心不支持的装配明确报错，保留一致挂点与摘要。
- 装配驾驶负责供给和运行编排，单指驾驶策略归控制层，调用核心动力链、助推与质量变化迁移。
- 新增装配性能摘要（供改装 UI 实时显示）。
- **BREAKING**：采用核心的 `vehicle-profile-5`/`vehicle-physics-5`，沿用"不静默兼容旧版本"的原则；v2/v3/v4 证据保留为历史。

## Capabilities

### New Capabilities

- `assembly-physics`：装配到物理参数的派生规则、质心与惯量计算、动力链与喷射部件参数派生、供给与运行接入、性能摘要。

### Modified Capabilities

- `vehicle-physics`：来自 `build-vehicle-physics` 变更（未归档）；发动机、变速箱、质心几何、质量迁移和外力合同集中修订在该核心变更，本变更只引用它。

## Impact

修改 `src/vehicle/physics` 的 profile、几何与力矩计算，新增 `src/loadout/compose`，更新基准/审计脚本与回放哈希。依赖 `add-vehicle-loadout-grid`。风险集中在回放基准重新验收。

## Architecture Revision

装备提供质量、占格几何、层高度与有效性能；核心质量属性函数计算总质量、三维质心及横摆惯量。部件自身惯量按占格面积估算。每个喷射器保留 instanceId、质心相对作用点、facing 推力方向和独立执行状态，不再用最长持续时间驱动全部喷射器。运行采用统一 control → mechanics → physics。电力预算每步按常驻设备、助推、武器顺序分配，所有分配之和不超过 maxOutput；武器采用有限本地充能后发射，充能也计入电池输出与剩余电量。燃油/弹药质量固定计入部件，不随余量变化；底盘碰撞形状保持固定。
