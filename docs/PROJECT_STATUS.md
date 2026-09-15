# 项目状态

## 当前架构

```text
浏览器 RPGJS Client ⇄ RPGJS Node Server（游戏世界权威）
                              ├─ 地图、碰撞与移动判定
                              └─ MMORPG 房间与玩家状态同步

浏览器 / 未来 Agent Runtime ⇄ FastAPI（大脑）
                              ├─ 知乎 Tool Registry 与 REST API
                              ├─ OAuth 契约
                              └─ LangGraph ReAct Agent chat loop
```

RPGJS 已从浏览器 standalone bridge 切换为真实 MMORPG server 模式。独立 Node 进程监听 `RPGJS_PORT`（默认 8001），客户端通过 `VITE_RPGJS_SERVER_HOST` 连接。加入同一房间的玩家由 RPGJS 服务端维护和广播，因此可互见并同步移动。

FastAPI 不再持有地图、房间、角色位置或 WebSocket 移动状态；`world.py` 与 `/ws/world` 已删除。它继续提供原有知乎搜索、直答、草稿、OAuth 状态和 Tool Registry。`/api/agent/chat` 现按分身人设启动 LangGraph ReAct Agent，并用 MemorySaver 按 `conversation_id` 保留上下文。

## 当前能力

- 64×48 连续 Tiled 小镇地图，已接入知乎热榜、知我居、问道馆、藏书阁、创作坊、天工坊六栋 PNG 建筑，以及南侧环路、独立底座碰撞和完整 2×2 树木；旧四分区地图保留为素材。布局和截图见 [TOWN_LAYOUT.md](./TOWN_LAYOUT.md)。
- 六栋建筑均已在门口注册可交互地标。`GET /api/world/buildings` 下发 24 项面向用户的能力目录及 `ready`、`unconfigured`、`auth_required`、`coming_soon` 状态；前端先展示建筑功能列表，再进入已接通的热榜、搜索、直答、选题、草稿、人设或创作数据页面。知乎 OAuth 未完成前，个人知乎数据入口保持“需授权”，不把服务端 Access Secret 所属账号误称为当前游戏用户。
- RPGJS 服务端权威 MMORPG 多人同步。
- 知乎公共内容、草稿、OAuth 预留 REST 能力保持不变。
- `POST /api/agent/chat` 已实现整段响应的 Agent Loop：自己的分身可用 11 个工具（4 个只读工具、`generate_draft`/`zhida`，以及 `user_contents`、`user_followees`、`user_collections`、`user_favlists`、`creator_account_stats` 5 个个人数据工具），访问别人的分身只可用 4 个只读工具。
- 登录页提供游客进入与知乎 OAuth 两条入口；游客沿用默认体验用户的刘看山 3×4 行走图并通过 RPGJS 同步给其他客户端；按 B 与自己的分身对话，靠近两格内的在线玩家或静态居民后通过 E/点击与对方分身对话。
- 对话复用一个本地面板并按分身保留页面内历史；打开面板会停止本地移动，但世界继续运行。Mock `avatar_id` 由客户端提供，只适用于本地 Demo，不能作为生产权限边界。
- Agent 默认使用 OpenAI 兼容地址 `https://api.openai-next.com/v1` 和模型 `deepseek-v4-flash`。本地模型 Key 与知乎 Access Secret 统一保存在仓库外的 `~/.config/zhiwojing/secrets.env`，并由 `run-local.sh` 在启动时读取；生产环境仍由部署平台注入 Secret。
- `POST /api/agent/step` 提供高层行为意图；`POST /api/agent/init` 仍为 HTTP 501 契约占位。
- 默认数据库初始化体验用户、苏晚、周博 3 个不同兴趣和表达风格的 mock 分身。
- PvP 动作战斗已补齐 RMSpritesheet 安全动画映射与远端玩家头顶实时血条；玩家 HP 归零后进入死亡状态并显示墓碑，复活后恢复原角色形象。攻击保持方向挥击预览，NPC/地标不参与战斗。规则和限制见 [ACTION_BATTLE.md](./ACTION_BATTLE.md)。

## 运行与构建

- `frontend/src/client.ts`：MMORPG 客户端入口。
- `frontend/src/server.ts`：RPGJS gameplay 模块。
- `frontend/src/node-server.ts`：独立 Node HTTP/WebSocket transport 入口。
- `npm run build`：生成客户端和 Node 服务端 bundle。
- `npm run server`：启动构建后的 RPGJS 世界服务。

## 后续安全工作

原 FastAPI 世界层的移动限速、断线清理与空房间 TTL 不再适用。上线前需在 RPGJS 权威侧重新实现并验证限速、防会话接管/身份绑定、断线回收与房间 TTL；这些加固不属于本次迁移范围。

## 前端 Agent 对话

地图在出生点旁保留苏晚（`avatar_id=2`）和周博（`avatar_id=3`）两个服务端托管 system-player 实体。它们使用统一挂机状态机持续巡游、模型意图和相遇对话；客户端按在线玩家解析并在 64 像素范围内选择最近目标。系统玩家不占用浏览器连接或 Presence 租约，模型不可用时退化为本地巡游。系统 Agent 请求使用 `SYSTEM_AGENT_TOKEN` 内部凭证；未配置时保持可运行但不调用模型。

## 在线分身托管（阶段 ⑤）

- RPGJS 玩家上线/重连默认进入挂机模式；`G` 可切换，一旦收到方向移动输入立即由真人接管，断线后重连恢复默认挂机。
- 挂机仅通过原生 `player.moveTo()` 下发目标，客户端使用 RPGJS 默认预测与同步，不直接写坐标或碰撞体。每秒按物理中心距目标 48px 只读检查到达并安排停留/下一目标；超时失败或生命周期结束才主动停止策略。
- 挂机移动由 RPGJS 服务端本地状态机持续执行，内置地点为中央广场及六栋建筑门前；LLM 只异步提供下一段高层意图，每玩家至少间隔 30 秒，失败不阻塞移动。
- 模型请求 5 秒内超时并按 15/30/60 秒退避；模型或密钥不可用时显示“本地巡游中”，G 与方向键仍可立即接管。
- 相遇检查保持 60 秒冷却，对话异步执行并可退化为本地短句，不再暂停移动。
- FastAPI `/api/agent/step` 接受位置、地点、附近分身、人设和上个动作，返回 `move`、`say` 或 `idle`。
- 当前阶段只支持页面在线托管：浏览器与 RPGJS 世界连接存活时，角色可由本人控制或分身挂机；页面关闭或连接断开后会取消请求、清除计时器并移除角色，不保留离线常驻实体，也不执行离线分身代答。
- 在线状态由每条世界连接每 15 秒续租，默认 45 秒过期；正常断开会立即撤销租约，异常断开会在租约过期后自动离线，同账号任一页面连接存活即视为在线。

## 两级长期记忆

FastAPI 已接入可关闭、可降级的 Mem0 长期记忆：主人私有 `avatar:{id}` 与双方共享 `pair:{min}-{max}` 严格隔离；meeting 会话逐轮总结，主人会话每 6 条消息提取事实/偏好/待办。关系、episode 与 profile 同步落入 avatar.db，LangGraph checkpoint 改为 `MEMORY_DATA_DIR` 下的 SQLite。详见 [MEMORY.md](./MEMORY.md)。

## 2026-09 人设冷启动

- 新增独立 persona_cards 结构化存储及知乎数据冷启动 API。
- 人设要点注入 chat/step；知我居新增可生成、刷新的人设入口。
- 关注数据仅用于兴趣抽取，不播种 relationships/contacts。

## 本地一键启动

完成 `backend/.venv` 与 `frontend/node_modules` 初始化后，可在仓库根目录运行 `./scripts/run-local.sh`。脚本会构建并启动 FastAPI 8000、RPGJS world 8001 与 Vite 5173；缺少本地密钥时允许以本地巡游模式启动。任一子进程退出时，其余进程会一并停止，避免留下残缺链路。

## 登录入口修复（2026-09-14）

- 游客登录成功后隐藏登录页并显示游戏；请求失败后可以再次点击重试。
- 游客与知乎 OAuth 登录现统一收敛到 FastAPI 应用 Session：前端集中保存应用 Token、为浏览器业务请求添加 Bearer 鉴权，并在刷新后通过 `/api/me` 恢复身份。本地一键启动默认开启 `AUTH_REQUIRED=1`，因此游客链路会经过与线上相同的 FastAPI 和 RPGJS 身份校验。
- 仅刚完成的 OAuth 回调携带一次性 `oauth=success` 标记并自动进入游戏；普通刷新即使 OAuth Session 仍有效也会停留在登录页，由用户点击“继续进入知我境”。标记在成功换取浏览器应用 Session 后立即从地址栏移除。
- OAuth 按黑客松模板区分授权与可选账号资料：换取 Token 成功后，`/user` 读取或解析失败不再阻断进入。没有稳定知乎 ID 时创建 `zhihu_id=null` 的独立本地分身，不关联已有账号；重新授权可能创建新分身。
- OAuth Token 仅存 FastAPI 进程内存，过期或进程重启后需重新授权。`/api/oauth/status` 提供 `profileAvailable` 和脱敏 `profileWarning`；`POST /api/auth/session` 将当前本地应用会话凭证交给 RPGJS，绝不返回知乎 Token。
- `POST /api/oauth/run-all` 使用当前会话的 OAuth Token 最小验证五项正式用户接口，空收藏夹跳过收藏夹内容。现有个人数据 Provider 与 Agent 工具仍沿用原配置，该验证接口不改变其身份契约。
- 当前回调仍要求有效 `state`；真实知乎授权和线上回跳仍需用户在部署环境验收。
- FastAPI 每天 04:00（Asia/Shanghai）清理全部游客账号及其 Session、联系人、消息、在线状态、人设、结构化/语义记忆和 Agent 对话 checkpoint；可用 `GUEST_CLEANUP_ENABLED=0` 临时关闭调度。清理发生时仍在线的游客会立即失去后续接口访问权限。
