# Proposal

## Why

vehicle-physics-1将期望误作实际状态边界，导致85°锁角、减速和旋转冻结；碰撞还会注入沿墙速度。重构必须让控制器尝试实现意图，由模式无关的物理决定实际运动。

## What Changes

- 普通控制器按车型、速度、路面和抓地余量限制前轮与动力请求；漂移只放宽控制策略和执行器包络。
- 物理核只接收执行器、车辆物理参数及路面，支持前后等效轮速、组合滑移、倒滑、spin和纯旋转。
- 删除实际侧滑/前进/目标速度限制、低速姿态拉回、意图夹角扣速及碰撞逃离速度。
- 普通控制从稳定初态在验收包络内避免自身转向诱发spin；撞击、已有失稳及抓地突变允许失控，控制器仅尝试恢复。
- **BREAKING**：vehicle-physics-2、vehicle-profile-2、route-assist-2、vehicle-snapshot-2；完整参数回放和能量收支重新验收，保留v1历史。

## Capabilities

### New Capabilities

- `vehicle-physics`：统一物理、有限执行器控制、十车型和可复现量化验证；主规范未归档，继续使用原路径。

### Modified Capabilities

无已归档能力；接入合同由validate-driving-prototype同步修订。

## Impact

重构vehicle/physics、snapshot、scene、debug、tests、scripts和文档，保留TypeScript、Canvas、单指输入及固定外层时钟。采用刚性车身与前后等效轴；不增加悬挂、挂车或完整四轮系统。
