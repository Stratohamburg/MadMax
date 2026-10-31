# Spec Delta

## Purpose
定义装配清单如何确定性地转换为车辆物理参数，使部件与武器的重量、位置和类型真实影响驾驶性能。

## ADDED Requirements

### Requirement: 确定性派生
给定相同底盘与装配清单，派生结果 SHALL 完全相同；派生 MUST 不依赖运行时状态、随机数或渲染。

#### Scenario: 重复派生一致
- **WHEN** 对同一装配连续派生两次
- **THEN** 两次得到逐字段相等的物理 profile

### Requirement: 质量、质心与转动惯量
总质量 SHALL 为底盘质量与所有部件质量之和；质心 SHALL 为质量加权位置；转动惯量 SHALL 包含各部件相对质心的平行轴贡献。

#### Scenario: 前置重炮
- **WHEN** 在车头外层放置重武器
- **THEN** 质心前移，前轴荷增加，总质量与横摆惯量增大

#### Scenario: 空装配
- **WHEN** 装配为空
- **THEN** 结果等于底盘基础参数

### Requirement: 质心偏移的物理表现
物理核心 SHALL 以派生质心作为转动与受力参考点，轴距分配、碰撞几何和接地点力矩 MUST 随质心变化。

#### Scenario: 后置质心
- **WHEN** 质心后移后进行同样的转向输入
- **THEN** 前后轴载荷按质心位置重新分配，车辆响应与基础车型不同

### Requirement: 动力与轮胎部件
动力部件 SHALL 修改驱动能力与最高速；轮胎部件 SHALL 修改抓地、刚度及路面适应性；所有修改 MUST 保持物理参数在核心校验范围内，越界时派生 SHALL 按文档化规则截断并给出提示。

#### Scenario: 超限参数
- **WHEN** 叠加部件使参数超出校验范围
- **THEN** 派生结果标明被截断的参数，不产生无效 profile

### Requirement: 额外执行器（喷射系统）
喷射系统 SHALL 作为有限推力执行器存在，具备推力、持续时间、冷却和可选能量消耗；触发 SHALL 来自控制层，物理层仍只接收执行器输出。

#### Scenario: 喷射冷却
- **WHEN** 喷射持续时间耗尽
- **THEN** 推力降为零，冷却结束前不可再次触发

### Requirement: 装配性能摘要
系统 SHALL 提供装配性能摘要：总质量、质心偏移、轴荷比、功重比、估计最高速、转向/抓地评级，供改装界面比较。

#### Scenario: 摘要随摆放变化
- **WHEN** 装配发生变化
- **THEN** 摘要与重新派生的 profile 一致

### Requirement: 版本化
派生 profile SHALL 标注 profile 与物理版本；旧版本配置 MUST 被拒绝而非静默转换。

#### Scenario: 旧版 profile
- **WHEN** 向新核心注入 vehicle-profile-2 参数
- **THEN** 被拒绝并返回版本错误
