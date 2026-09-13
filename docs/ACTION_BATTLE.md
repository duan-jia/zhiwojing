# PvP 动作战斗 v1

## 操作与规则

- 客户端按 `J` 发出 RPGJS 标准 `action` 输入。输入框、文本域或可编辑元素聚焦时忽略，长按也不会重复触发；Space/Enter 继续只用于既有地标/对话互动。
- 玩家初始和复活血量均为 100，每次有效命中固定扣 25，最低为 0。
- 目标选择器为 `player.actionBattleTargets = 'players'`。框架仍会排除自己与已经倒地的目标；地图静态居民和地标是普通事件，没有 Battle AI，因此不进入战斗目标集合。
- `@rpgjs/action-battle` 负责攻击判定、击退、400ms 受击无敌帧、命中停顿、闪烁、震屏和伤害弹字。v1 使用 `classic` 配置，并关闭连击、蓄力、防御、闪避、软锁定、技能/热键栏、装备扩展及 AI 敌人协调器。

## 倒地与复活

`hp <= 0` 时服务端同步 `defeated=true`，清空输入、停止移动并暂停挂机自治。真人控制的玩家可点击左下角 HUD 的「复活」；挂机分身在 30 秒后自动复活。复活发生在原地，恢复 100 HP、移动和自治，并获得 3 秒无敌。

## 配置与扩展点

- `frontend/src/modules/main/combat.ts`：服务端权威伤害、目标过滤、倒地/复活和 Action Battle 配置。
- `frontend/src/combat-input-logic.ts`：J 键映射的可测试纯逻辑。
- `frontend/src/combat-hud-logic.ts`：血量显示归一化。
- `frontend/src/combat-state.ts`：HP、伤害、复活时间常量和纯逻辑。

后续如需阵营或安全区，应扩展 `combat.targets.canTarget`，不要把规则下放到客户端。v2 遗留项包括恩怨记忆；连击、技能、装备、防御、闪避和 NPC 参战均不在 v1 范围内。
