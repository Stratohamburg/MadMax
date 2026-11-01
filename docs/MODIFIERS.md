# 局内加成与数值诊断

`src/progression/modifiers/` 管理局内升级，`src/stats/modifiers.ts` 是车辆、武器、伤害共用的属性求值器。flat、increased、more 顺序固定；标签按 allTags/anyTags 过滤，可选 instanceId 只作用于指定武器。贡献按来源和 ID 排序，不依赖获取顺序或渲染。

## 升级状态

`createModifierRun(seed)` 开始空构筑；`offerChoices(state, buildTags)` 生成三选一，不足三种时返回实际数量，耗尽时 `exhausted=true`。候选加权无放回，排除已满级项。common/rare/epic 系数为1/0.35/0.08，匹配 build 标签权重×3；连续三次无相关项，下一次强制至少一项匹配（若仍有可用匹配项）。

待选项存在时重复请求保持同一组，`offerChoices(..., true)` 消耗刷新次数，初始三次。`chooseUpgrade` 只接受待选 ID，选择后清空待选。`grantUpgrade` 供事件直接授予，仍受堆叠上限约束。

限时项保存绝对到期模拟时间，replace 刷新至当前时间+持续时间，extend 从当前到期时间继续延长；`advanceModifiers` 移除到期项。局结束丢弃整个状态，新一局不得复用上一局升级。

## 相邻协同

相邻按同层占格四邻接判定，旋转后的形状参与计算。相邻的弹幕/爆炸/火焰武器每邻居提供10%加算伤害，仅作用于这件实例。多格部件的同一邻居不会重复计数，跨层不算相邻。装配变化后调用 `adjacencyModifiers` 重建并缓存结果，固定步不重复计算。

## 诊断

```powershell
npm run modifiers:diagnose
npm run modifiers:diagnose -- path/to/loadout.json damage barrage
npx vitest run tests/unit/modifiers.test.ts
```

未提供文件时诊断跑车出厂预设。输出装配摘要、各武器伤害/射速/弹数的分层贡献、爆发DPS和考虑散热占空比的持续DPS估计。乘算积>8、乘算来源>8或物理参数截断会告警。DPS假定有效命中，不代表实战命中率或设备性能。
