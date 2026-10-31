# Spec Delta

## Purpose
定义副本战斗模式（主线剧情）及搜打撤规则：进入、战斗、搜刮、撤离与结算，将改装与战斗串成有风险与收益的循环。

## ADDED Requirements

### Requirement: 副本生命周期
一次副本 SHALL 经历准备、进入、局内、结束（撤离/失败/通关）与结算阶段，阶段转移 MUST 单向，局结束后 SHALL NOT 再改变局内状态。

#### Scenario: 正常撤离
- **WHEN** 玩家在撤离点完成撤离
- **THEN** 进入结算阶段并锁定局内状态

### Requirement: 准备阶段装配
进入副本前玩家 SHALL 选择底盘与装配；进入后装配 MUST NOT 被手动修改，战斗中的损毁/脱落除外。

#### Scenario: 局内改装
- **WHEN** 局内尝试手动修改装配
- **THEN** 操作被拒绝

### Requirement: 关卡内容
关卡 SHALL 定义区域、敌人刷新/波次、搜刮点、撤离点与可选 Boss；相同关卡定义与种子 SHALL 产生相同的刷新结果。

#### Scenario: 种子一致
- **WHEN** 以相同种子进入同一关卡
- **THEN** 敌人刷新序列相同

### Requirement: 搜刮与携带
局内战利品 SHALL 占用有限的携带空间；超出空间时 SHALL 拒绝拾取或提示替换，不得静默丢失。

#### Scenario: 携带已满
- **WHEN** 携带空间已满时拾取新物品
- **THEN** 拾取被拒绝或要求玩家选择替换项

### Requirement: 撤离
撤离点 SHALL 有激活条件与撤离倒计时；倒计时期间玩家离开撤离范围 SHALL 重置倒计时；撤离成功才算带出战利品。

#### Scenario: 撤离被打断
- **WHEN** 倒计时期间玩家离开撤离范围
- **THEN** 倒计时重置

### Requirement: 失败与损失
玩家车辆被摧毁或超时失败时 SHALL 按规则损失：局内战利品丢失，已装配部件按配置比例掉落或损坏；规则 SHALL 在准备阶段向玩家明示。

#### Scenario: 车辆被摧毁
- **WHEN** 车辆血量归零
- **THEN** 局内战利品丢失，并按规则结算装配损失

### Requirement: 局内肉鸽集成
副本 SHALL 在规定节点（击杀、区域完成、Boss 等）触发加成选择；局内加成 MUST NOT 跨局保留。

#### Scenario: 新一局
- **WHEN** 开始新的副本
- **THEN** 不带有上一局的局内加成

### Requirement: 主线节点
关卡 SHALL 可关联主线剧情节点（解锁、剧情触发点），通关主线关卡 SHALL 触发解锁事件交由进度系统处理。

#### Scenario: 通关解锁
- **WHEN** 通关主线关卡
- **THEN** 发出解锁事件及结算数据

### Requirement: 结算
结算 SHALL 输出带出战利品、损失、经验/货币与统计（击杀、伤害、用时）。

#### Scenario: 结算输出
- **WHEN** 副本结束
- **THEN** 产生包含上述字段的结算结果
