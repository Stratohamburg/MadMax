# 愿景方案实施与验证记录

日期：2026-11-01。按游戏愿景和依赖顺序逐项细化并实施，所有变更保持在当前工作区，未归档。

## 实施进度

| OpenSpec 变更 | 完成 / 总数 | 交付 |
| --- | --- | --- |
| validate-driving-prototype | 4 / 5 | 驾驶、触控、场景与桌面回归；真实手机驾驶保留待办 |
| build-vehicle-physics | 10 / 10 | 物理核心、十车型与基准 |
| add-vehicle-loadout-grid | 10 / 10 | 双层格、部件形状/槽/朝向、预设、资源、稳定序列化 |
| add-assembly-physics | 14 / 14 | v4 装配参数/能力、质量迁移、核心动力链接入及378工况矩阵 |
| add-auto-weapons | 14 / 14 | 九种独立武器、有限转速/射界、枪口/弹道/特效、资源、被动事件、后坐力 |
| add-combat-damage | 14 / 15 | 七种步兵/车辆/建筑/首领、真实敌方弹道、碾压承伤、损毁/维修及压测；真实手机性能保留待办 |
| add-roguelike-modifiers | 9 / 9 | 分层修饰符、三选一、刷新/保底、相邻协同、诊断 |
| add-pve-extraction-mode | 11 / 11 | 准备到结算、可播种货场、Boss、搜刮、撤离、失败损失和主线事件 |
| add-progression-persistence | 9 / 9 | IndexedDB、版本迁移、校验备份、pending 恢复、原子幂等、真实库存与成长 |
| add-vehicle-ui | 14 / 14 | 车辆俯视、正方格、一体装备、实际炮台转动与指向细线、双方完整攻击反馈及三宽度证据 |
| add-driving-hub | 6 / 6 | 默认可驾驶营地、商店/装备/出击停车区、停稳进入、暂停、拖车恢复、副本返回 |

共 115 / 117 项。用户确认当前无法连接手机，继续其余工作，保留两项真机验收；桌面与模拟视口结果不替代手机证据。

## 可操作入口

`npm run dev -- --port 5173 --strictPort` 后打开 `http://localhost:5173/`，默认进入驾驶营地。

1. 出生点前方左侧为商店、中间为装备、右侧为出击；开入彩色停车框并松手停稳 0.7 秒进入。关闭后需离开再进入，模态界面暂停车辆。坏车可拖到装备区恢复。
2. 装备工作台提供同一车辆的底盘/外观俯视，正方格上的多格装备以完整形状显示。可拖拽、旋转、升级维修并保存；返回营地后实际车辆同步更新。
3. 出击准备页展示 180 秒/8 格/失败逐件 25% 损失等规则。出击后单摇杆驾驶，自动武器、资源消耗、模块损伤、拾取、维修与局内升级共同推进。
4. 南撤 20 秒开放，北撤要求 Boss 死亡，范围内停留 5 秒；离开范围归零。结算原子入档、失败可重试，保存成功后返回营地，使用真实库存与耐久。

`/?mode=practice` 为独立驾驶练习场，`/?validate=1` 和 `/?test=1` 保留原验证入口；`/?combat-benchmark=1` 打开浏览器战斗压测。

## 验证证据

- 全量 Vitest：31 个测试文件，233 项通过。覆盖旧物理基线、装配、资源、武器、模块、升级、PvE、迁移、事务中断/重启、库存真实性、完整部件轮廓和停车触发。新增战斗配置文件中26项测试覆盖九种武器真实开火/命中、七种敌人、阵营/建筑、碾压与幂等存档，以及双方交火在30/60/120 FPS下的完整事件一致性。
- Playwright：45 项通过，含原驾驶/触控回归、车库、副本、真实 IndexedDB 重载、保存失败重试、实际摇杆驶入营地装备区、交易、装配更新和坏车恢复。320/390/430 像素截图与格子宽高测量在 [UI 证据目录](../openspec/changes/add-vehicle-ui/evidence/)，营地截图与驾驶记录在 [营地证据目录](../openspec/changes/add-driving-hub/evidence/)。
- Canvas 像素检查：射界净空圆内部像素完全透明，圆外有实际绘制，武器状态不被绘制修改。
- PvE 30/60/120 FPS 使用相同带时间戳输入，最终完整状态相等；自动射击命中及弹药消耗通过整合测试。
- `npm run build` 通过，`openspec validate --all --strict` 全部 11 项通过。
- v4 物理基准/审计 runId 为 `99e4b5beb9ac`，网页回放使用同版核心，十车型、七组对比、19200 轨迹点，30/60/120 FPS 状态偏差为零。详见 [装配物理验收](../openspec/changes/add-assembly-physics/acceptance-v4.md)，旧证据保留。
- 战斗桌面报告为 [desktop-benchmark.json](../openspec/changes/add-combat-damage/evidence/desktop-benchmark.json)：128 敌人、2048 容量（峰值 2047）、600 个测量步，p95 0.875 ms、max 2.2291 ms；工程目标 p95 ≤4 ms，`mobileVerified:false`。
- 新增 [真实敌方武器压力记录](../openspec/changes/add-combat-damage/evidence/desktop-roster-benchmark.json)：128个敌人覆盖七种配置、2048弹丸满池，600测量步的p95为2.8166ms，max为6.0150ms；包含武器逻辑与展示事件消费，不含Canvas绘制及预填开销，`mobileVerified:false`。三种竖屏实战、炮口细线像素和实际设计总览见 [战斗验收](../openspec/changes/add-vehicle-ui/evidence/combat-validation.md)。

部件与驾驶说明见 [装配](LOADOUT.md)、[物理](ASSEMBLY_PHYSICS.md)、[武器](AUTO_WEAPONS.md)、[伤害](COMBAT.md)、[肉鸽](MODIFIERS.md)、[副本](PVE.md)、[档案](PERSISTENCE.md) 和 [界面](VEHICLE_UI.md)。

## 仍需真实设备完成

- validate-driving-prototype：至少一台真实手机的驾驶手感、触控与场景观察记录。
- add-combat-damage：同一工程压测在真实手机运行并记录设备、浏览器、预算与耗时分位数。

未把上述两项标记完成，未执行变更归档，也未声称已达到正式移动端发行或内容完整度。
