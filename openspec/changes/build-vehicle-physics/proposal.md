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

## Core Ownership Revision

本能力继续作为未归档车辆核心规范的唯一来源。发动机扭矩/功率与自动变速箱、有限助推、二维质心受力、质量变化迁移、实体接触冲量和外部作用去重统一归入 vehicle-physics；assembly-physics 仅选择部件并派生参数。当前修订为 vehicle-physics-5 / vehicle-profile-5 / vehicle-snapshot-5、route-assist-4，历史 v2/v3/v4 证据保留。

## Architecture Revision

输入层提供世界运动方向、目标速度和漂移/助推请求；angle 保留为输入兼容字段，其语义固定为 desiredTravelDirection。control/ 负责路线、速度、自动挡选择和喷射策略。物理核心只消费控制命令解析后的执行器、参数和外部作用，独立负责机械、轮胎、质量属性、场景接触和双刚体冲量。观测不推进控制；每个控制步仅推进一次控制历史。持续力和瞬时冲量有独立类型，冲量按 tick/source/sequence 去重，不乘 dt。外部状态只能经核心接口迁移。当前版本升级 v5；历史证据保留。完整悬挂、翻车、倒挡、动态燃油/弹药质量与附加外挂碰撞轮廓不在本轮实施；采用明确的固定消耗品质量和底盘轮廓近似。
