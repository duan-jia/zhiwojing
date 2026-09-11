# 项目状态

## 当前架构

```text
浏览器 RPGJS Client ⇄ RPGJS Node Server（游戏世界权威）
                              ├─ 地图、碰撞与移动判定
                              └─ MMORPG 房间与玩家状态同步

浏览器 / 未来 Agent Runtime ⇄ FastAPI（大脑）
                              ├─ 知乎 Tool Registry 与 REST API
                              ├─ OAuth 契约
                              └─ Agent chat / step / init 契约 stub
```

RPGJS 已从浏览器 standalone bridge 切换为真实 MMORPG server 模式。独立 Node 进程监听 `RPGJS_PORT`（默认 8001），客户端通过 `VITE_RPGJS_SERVER_HOST` 连接。加入同一房间的玩家由 RPGJS 服务端维护和广播，因此可互见并同步移动。

FastAPI 不再持有地图、房间、角色位置或 WebSocket 移动状态；`world.py` 与 `/ws/world` 已删除。它继续提供原有知乎搜索、直答、草稿、OAuth 状态和 Tool Registry，并新增三个返回 HTTP 501 明确占位结果的 Agent 契约端点。

## 当前能力

- 100×100 连续 Tiled 景观地图、基础碰撞、角色移动与镜头。
- RPGJS 服务端权威 MMORPG 多人同步。
- 知乎公共内容、草稿、OAuth 预留 REST 能力保持不变。
- `POST /api/agent/init`、`/api/agent/chat`、`/api/agent/step` 已有 Pydantic 请求/响应 schema，Agent Loop 尚未实现。

## 运行与构建

- `frontend/src/client.ts`：MMORPG 客户端入口。
- `frontend/src/server.ts`：RPGJS gameplay 模块。
- `frontend/src/node-server.ts`：独立 Node HTTP/WebSocket transport 入口。
- `npm run build`：生成客户端和 Node 服务端 bundle。
- `npm run server`：启动构建后的 RPGJS 世界服务。

## 后续安全工作

原 FastAPI 世界层的移动限速、断线清理与空房间 TTL 不再适用。上线前需在 RPGJS 权威侧重新实现并验证限速、防会话接管/身份绑定、断线回收与房间 TTL；这些加固不属于本次迁移范围。
