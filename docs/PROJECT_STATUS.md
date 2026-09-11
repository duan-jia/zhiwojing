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
- `POST /api/agent/chat` 已实现整段响应的 Agent Loop：自己的分身可用 6 个工具（含 `generate_draft`/`zhida`），访问别人的分身只可用 4 个只读工具。
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
