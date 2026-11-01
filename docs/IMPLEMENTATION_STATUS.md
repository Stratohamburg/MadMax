# 愿景方案实施与验证记录

日期：2026-11-01。按游戏愿景和依赖顺序逐项细化并实施，所有变更保持在当前工作区，未归档。

## 实施进度

| OpenSpec 变更 | 完成 / 总数 | 交付 |
| --- | --- | --- |
| validate-driving-prototype | 4 / 5 | 驾驶、触控、场景与桌面回归；真实手机驾驶保留待办 |
| build-vehicle-physics | 6 / 6 | 物理核心、十车型与基准 |
| add-vehicle-loadout-grid | 10 / 10 | 双层格、部件形状/槽/朝向、预设、资源、稳定序列化 |
| add-assembly-physics | 11 / 11 | v3 质心/惯量/轴荷、动力链、换挡、自动助推、挂点外力 |
| add-auto-weapons | 11 / 11 | 九类武器、自动索敌、锁定/过热、资源、被动事件、后坐力 |
| add-combat-damage | 11 / 12 | 池化战斗、伤害、模块损毁/脱落/维修、压测；真实手机性能保留待办 |
| add-roguelike-modifiers | 9 / 9 | 分层修饰符、三选一、刷新/保底、相邻协同、诊断 |
| add-pve-extraction-mode | 10 / 10 | 准备到结算、可播种货场、Boss、搜刮、撤离、失败损失和主线事件 |
| add-progression-persistence | 9 / 9 | IndexedDB、版本迁移、校验备份、pending 恢复、原子幂等、真实库存与成长 |
| add-vehicle-ui | 8 / 8 | 双层工作台、方案与成长操作、纸娃娃、射界净空、外沿状态、保存重试 |

共 89 / 91 项。用户确认当前无法连接手机，继续其余工作，保留两项真机验收；桌面与模拟视口结果不替代手机证据。

## 可操作入口

`npm run dev -- --port 5173 --strictPort` 后打开 `http://localhost:5173/?mode=pve`。

1. 准备页可查看 180 秒/8 格/失败逐件 25% 损失等规则，进入工作台编辑、保存与购买升级。
2. 出击后单摇杆驾驶，自动武器、资源消耗、模块损伤、物资拾取、维修和局内升级共同推进。
3. 南撤 20 秒开放，北撤要求 Boss 死亡，范围内停留 5 秒。离开撤离范围计时归零。
4. 结算先暂存再原子入档，保存失败可重试。下一局按真实库存、等级和耐久初始化。

`/` 保留独立驾驶练习场与验证模式；`/?combat-benchmark=1` 打开浏览器战斗压测。

## 验证证据

- 全量 Vitest：22 个测试文件，157 项通过。覆盖旧物理基线、装配、资源、武器、模块、升级、PvE、迁移、事务中断/重启、库存真实性及反馈状态。
- Playwright：30 项通过，含原驾驶/触控回归与新车库、副本、真实 IndexedDB 重载、保存失败重试。320/390/430 像素竖屏截图在 [UI 证据目录](../openspec/changes/add-vehicle-ui/evidence/)。
- Canvas 像素检查：射界净空圆内部像素完全透明，圆外有实际绘制，武器状态不被绘制修改。
- PvE 30/60/120 FPS 使用相同带时间戳输入，最终完整状态相等；自动射击命中及弹药消耗通过整合测试。
- `npm run build` 通过，`openspec validate --all --strict` 全部 10 项通过。
- 物理基准/审计与网页回放 runId 为 `7fe385e6d987`，十车型、七组对比、19200 轨迹点，30/60/120 FPS 状态偏差为零。详见 [装配物理验收](../openspec/changes/add-assembly-physics/acceptance.md)，旧证据保留。
- 战斗桌面报告为 [desktop-benchmark.json](../openspec/changes/add-combat-damage/evidence/desktop-benchmark.json)：128 敌人、2048 容量（峰值 2047）、600 个测量步，p95 0.875 ms、max 2.2291 ms；工程目标 p95 ≤4 ms，`mobileVerified:false`。

部件与驾驶说明见 [装配](LOADOUT.md)、[物理](ASSEMBLY_PHYSICS.md)、[武器](AUTO_WEAPONS.md)、[伤害](COMBAT.md)、[肉鸽](MODIFIERS.md)、[副本](PVE.md)、[档案](PERSISTENCE.md) 和 [界面](VEHICLE_UI.md)。

## 仍需真实设备完成

- validate-driving-prototype：至少一台真实手机的驾驶手感、触控与场景观察记录。
- add-combat-damage：同一工程压测在真实手机运行并记录设备、浏览器、预算与耗时分位数。

未把上述两项标记完成，未执行变更归档，也未声称已达到正式移动端发行或内容完整度。
