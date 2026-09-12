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

- 100×100 连续 Tiled 景观地图、基础碰撞、角色移动与镜头。
- RPGJS 服务端权威 MMORPG 多人同步。
- 知乎公共内容、草稿、OAuth 预留 REST 能力保持不变。
- `POST /api/agent/chat` 已实现整段响应的 Agent Loop：自己的分身可用 11 个工具（4 个只读工具、`generate_draft`/`zhida`，以及 `user_contents`、`user_followees`、`user_collections`、`user_favlists`、`creator_account_stats` 5 个个人数据工具），访问别人的分身只可用 4 个只读工具。
- 登录页可选择 3 个本地 Mock 身份并通过 RPGJS 同步给其他客户端；按 B 与自己的分身对话，靠近两格内的在线玩家或静态居民后通过 E/点击与对方分身对话。
- 对话复用一个本地面板并按分身保留页面内历史；打开面板会停止本地移动，但世界继续运行。Mock `avatar_id` 由客户端提供，只适用于本地 Demo，不能作为生产权限边界。
- Agent 默认使用 OpenAI 兼容地址 `https://api.openai-next.com/v1` 和模型 `deepseek-v4-flash`。本地模型 Key 与知乎 Access Secret 统一保存在仓库外的 `~/.config/zhiwojing/secrets.env`，并由 `run-local.sh` 在启动时读取；生产环境仍由部署平台注入 Secret。
- `POST /api/agent/init` 与 `/api/agent/step` 仍为 HTTP 501 契约占位。
- 默认数据库初始化体验用户、苏晚、周博 3 个不同兴趣和表达风格的 mock 分身。

## 运行与构建

- `frontend/src/client.ts`：MMORPG 客户端入口。
- `frontend/src/server.ts`：RPGJS gameplay 模块。
- `frontend/src/node-server.ts`：独立 Node HTTP/WebSocket transport 入口。
- `npm run build`：生成客户端和 Node 服务端 bundle。
- `npm run server`：启动构建后的 RPGJS 世界服务。

## 后续安全工作

原 FastAPI 世界层的移动限速、断线清理与空房间 TTL 不再适用。上线前需在 RPGJS 权威侧重新实现并验证限速、防会话接管/身份绑定、断线回收与房间 TTL；这些加固不属于本次迁移范围。

## 前端 Agent 对话

地图在出生点旁保留苏晚（`avatar_id=2`）和周博（`avatar_id=3`）两个静态居民。客户端统一解析静态居民和携带同步 `avatarId` 的在线玩家，在 64 像素范围内选择最近目标；B 打开自己的分身，E 或近距离点击打开目标分身。请求继续调用 `POST /api/agent/chat`，并按 `viewerAvatarId:targetAvatarId` 维持会话。

## 离线分身自治（阶段 ⑤）

- RPGJS 玩家上线/重连默认进入挂机模式；`G` 可切换，一旦收到方向移动输入立即由真人接管，断线后重连恢复默认挂机。
- 挂机行为是事件驱动的：启用、抵达地点、两格内相遇时才调用 `/api/agent/step`，不进行定时 LLM 轮询。内置地点为广场、水井、树林、河边、集市。
- 相遇双方空闲且 60 秒冷却结束后进行一轮两句交流；开场使用 step，另一分身用 `/api/agent/chat` 回应。同步的 `agentSpeech` 在同房间客户端显示气泡。
- FastAPI `/api/agent/step` 接受位置、地点、附近分身、人设和上个动作，返回 `move`、`say` 或 `idle`。

## 两级长期记忆

FastAPI 已接入可关闭、可降级的 Mem0 长期记忆：主人私有 `avatar:{id}` 与双方共享 `pair:{min}-{max}` 严格隔离；meeting 会话逐轮总结，主人会话每 6 条消息提取事实/偏好/待办。关系、episode 与 profile 同步落入 avatar.db，LangGraph checkpoint 改为 `MEMORY_DATA_DIR` 下的 SQLite。详见 [MEMORY.md](./MEMORY.md)。
