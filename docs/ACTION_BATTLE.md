# PvP 动作战斗 v1

## 操作与规则

- 客户端按 `J` 发出 RPGJS 标准 `action` 输入。输入框、文本域或可编辑元素聚焦时忽略，长按也不会重复触发；Space/Enter 继续只用于既有地标/对话互动。
- 玩家初始和复活血量均为 100，每次有效命中固定扣 25，最低为 0；测试 NPC 初始 HP 为 100，最低保留 1 HP，不会死亡或触发复活流程。
- 目标选择器允许玩家和显式标记的测试 NPC。苏晚、周博设置了 `combatNpc=true` 与最小 `battleAi` 标记，可以被攻击但不会进入真人玩家的 PvP 规则；地标仍不可攻击。
- `@rpgjs/action-battle` 负责攻击判定、击退、400ms 受击无敌帧、命中停顿、闪烁、震屏和伤害弹字。v1 使用 `classic` 配置，并关闭连击、蓄力、防御、闪避、软锁定、技能/热键栏、装备扩展及 AI 敌人协调器。

## 动画与可见反馈

现有 `RMSpritesheet(3, 4)` 只提供 `stand` 与 `walk`。Action Battle 在未配置时会默认播放 `attack`，不存在的纹理会令角色短暂空白。`combat-animation-logic.ts` 因此显式覆盖框架的全部动画键：`attack` 映射到有效的 `stand`，`hurt`、`stagger`、`die`、`castSkill`、`castSpell`、`guard`、`parry` 明确返回 `null`。攻击的动作辨识由框架的短促方向性 attack preview（即使无目标也显示）以及命中闪光、震屏和伤害数字承担。未来加入真正的攻击序列后，只需在该映射中替换 `attack`。

## 头顶血条

客户端通过 `addSpriteComponentInFront` 把 CanvasEngine 血条直接挂到每个远端玩家精灵；它不依赖屏幕坐标投影，随角色和镜头移动。血条只显示实时剩余比例，归零时灰化，不显示文字。当前组件仍排除事件，因此测试 NPC 可受击但暂不显示头顶血条。自己的左下角 HUD 同样只显示血条；窄屏沿用固定左下角位置，不覆盖右侧通讯录/对话区域。

## 死亡与复活

`hp <= 0` 时玩家进入死亡状态，服务端同步内部状态 `defeated=true`，清空输入、停止移动并暂停挂机自治，同时把角色形象替换为墓碑。真人控制的玩家可点击左下角 HUD 的「复活」；挂机分身在 30 秒后自动复活。复活发生在原地，恢复原角色形象、100 HP、移动和自治，并获得 3 秒无敌。

## 配置与扩展点

- `frontend/src/modules/main/combat.ts`：服务端权威伤害、目标过滤、死亡/复活和 Action Battle 配置。
- `frontend/src/combat-input-logic.ts`：J 键映射的可测试纯逻辑。
- `frontend/src/combat-hud-logic.ts`：血量显示归一化。
- `frontend/src/combat-animation-logic.ts`：RMSpritesheet 安全动画映射。
- `frontend/src/remote-player-health.ts`：远端玩家精灵上的血条显示。
- `frontend/src/combat-state.ts`：HP、伤害、复活时间常量和纯逻辑。

后续如需阵营或安全区，应扩展 `combat.targets.canTarget`，不要把规则下放到客户端。当前美术限制是攻击仍复用站立帧（可见挥击由 preview 绘制）；v2 遗留项包括真正的攻击 spritesheet 与恩怨记忆。连击、技能、装备、防御、闪避和 NPC 参战均不在 v1 范围内。
