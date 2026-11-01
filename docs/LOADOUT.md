# 双层车辆装配

`src/loadout/index.ts` 提供无 DOM 的装配合同。当前包含十车型占位底盘和部件数据，平衡数值尚非正式内容。工作台、装配物理、战斗和档案共同消费本模块。

## 坐标与层

车头为局部 +x，右侧为 +y；整数坐标表示格中心。每格为 0.12 game-L，质量用 kg，后续物理按 1000 kg = 1 game-M 换算。当前物理使用游戏单位，不应直接把 game-L 当作米。

内层是车长/车宽范围内的奇数矩形，外层向四边各扩一格。内层槽为 `internal`，外层车顶槽为 `roof`，外挂边缘槽为 `edge`。格子显式声明可用性和外露方向，两层同坐标可以分别占用。部件必须满足层、槽、旋转、数量上限和无重叠等约束。

## 定义与实例

`CHASSIS` / `PARTS` 保存定义。`Loadout` 仅保存 `vehicle-loadout-1`、`chassisId` 和部件实例；实例包括 `instanceId`、`partId`、层、整数锚点、`rotation` 和 `facing`。不要修改共享目录对象。

形状围绕锚点进行 0/90/180/270° 旋转；武器朝向独立，支持 45° 间隔的八方向。正角度从 +x 转向 +y。`occupiedCells` 返回旋转后的占格，`mounts` 返回占格中心换算后的局部挂点、朝向、武器定义 ID 和外露标记。

## 编辑与预设

`emptyLoadout` 创建空装配。`placePart`、`movePart`、`rotatePart`、`facePart`、`updatePart`、`removePart` 返回 `EditResult`。成功时 `ok=true`、`value` 和 `loadout` 指向新的合法装配；失败时 `ok=false`、`errors` 提供代码、实例和冲突格，`loadout` 保留原对象。

`stockLoadout(chassisId)` 提供十车型出厂预设，包括驾驶座、发动机、变速箱、油箱、电池、共用弹药箱和机枪。重载车型使用柴油机与重载变速箱。实例 ID、放置次序稳定，每次读取均返回独立清单，恢复预设不会受到之前编辑的影响。

## 整车供给

`resourceBudget` 汇总电池容量、最大输出、充电速率、部件总功耗、油量和按类型区分的弹药，并报告 `powerSufficient`。格子间无需连线或弹药管路。它提供装配预算；运行时的能量、油量和弹药消耗由武器/副本系统管理。

## 加载与版本

`serializeLoadout` 验证后以固定字段顺序、按实例 ID 的代码点顺序输出 JSON。`deserializeLoadout` 返回结构化成功或错误；未知版本/底盘/部件、重复实例、非法数值、未知字段和非法布局全部拒绝，不进行静默修复。物理、存档和回放可使用该稳定文本作为输入。

验证命令：

```powershell
npx vitest run tests/unit/loadout.test.ts
npm run typecheck
openspec validate add-vehicle-loadout-grid --strict --no-interactive
```
