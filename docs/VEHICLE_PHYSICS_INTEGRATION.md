# 验证场接入清单

本清单交给 `validate-driving-prototype`。核心入口是 `src/vehicle/physics/index.ts`，配置/路面格式分别为 `vehicle-profile-1`/`vehicle-surface-1`，路面包含干硬路、松散地、湿滑地；网页通过 `src/vehicle/model.ts` 使用同一个核心状态。`build-vehicle-physics` 的通过仍不自动代表浏览器或手机验收通过。

## 单一权威状态

- [x] 在一次接入中迁移 `src/vehicle/model.ts` 公共门面和生产消费者，移除旧角度追赶链路。使用 `createPhysics(getProfile(id))` 绑定经校验配置，不把baseline参数塞进新模型。
- [x] 摇杆把距离映射为车型目标速度，把角度保持为世界路线输入；漂移开关只控制意图，不直接写delta/theta/r或侧向速度。
- [x] 每次外层1/120秒采样意图，调用一次核心step；两次1/240子步由核心完成。渲染只插值显示，不能改变物理子步数。
- [x] 测试注入改用一致初态工厂的世界速度向量、theta/r/delta/h与历史，不再拼接speed/motion。快照只序列化权威历史和版本，速度/运动方向保持派生。

## 消费共用几何与观测

- [x] 四轮、实际前轮显示角、前后车身边界、胎痕与碰撞占地均消费geometry；禁止各模块各算一套轮位。
- [x] 长车碰撞完成保守平移/旋转扫掠及墙角测试；核心提供四角、AABB与保守圆，场景负责求交。首版重车是刚性单车身、前后等效轴。
- [x] 碰撞停车调用collisionStop清平移、横摆、轮胎、载荷及辅助历史；有切向空间时场景投影法向速度后允许重新起步。
- [x] 胎痕使用实际接地点滑移观测区分几何转弯与漂移；低速几何转弯不单独生成胎痕。
- [x] 路面采样器按传入的前/后轴位置返回独立版本数据；本阶段不宣称已实现左右split-μ。
- [x] 验证面板显示目标/实际前轮、theta/beta、r、轴载荷、侧偏、力与预算、游戏代价/滚阻/动力和保护；observe提供当前状态预览，不是平均碰撞冲量。

## 配置与生命周期

- [x] 车型选择提供十个稳定ID与修订；类别只选择数据，不选择另一个物理算法。
- [x] 参数编辑先整组validateProfile/applyProfile，再重新绑定createPhysics；失败保留原对象，成功/恢复默认/换车完整重置，禁止修改已冻结配置绕过校验。
- [x] 重置、换车、后台输入清理和恢复覆盖速度向量、r、delta、h、轮胎力记忆、上一物理作用及辅助目标角速度历史；暂停不积累物理dt。
- [x] 更新README、DRIVING、PROJECT_OVERVIEW和原PARAMETERS总览，将旧axle-dynamics-1升级目标统一链接到VEHICLE_PHYSICS和VEHICLE_PROFILES，保留baseline-1历史运行事实；入口命令和当前边界已记录。

## 场景与设备验收

- [x] 新浏览器测试与截图写vehicle-physics-1独立证据路径，已修正旧e2e硬编码输出目录并保留baseline-1证据。
- [x] 完成十车型显示、长车扫掠、胎痕、路面过界、重置/碰撞/换车/后台、三视口输入等接入测试。
- [ ] 真实手机执行满油门、小修正、连续弯、主动进出漂移、长车碰撞与触控中断；浏览器仿真和无DOM基准不能替代。
- [ ] 接入变更独立更新自己的acceptance和任务状态，通过后按自身流程归档；核心不自动勾选这些任务。

核心参数/单位见[车型说明](VEHICLE_PROFILES.md)，物理/能量近似见[核心说明](VEHICLE_PHYSICS.md)，量化门槛与独立报告见 `openspec/changes/build-vehicle-physics/acceptance.md`。
