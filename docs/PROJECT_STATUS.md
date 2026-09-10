# 项目现状

## 产品概况

“知乎数字分身”正在验证 RPGJS v5 单地图开放世界与 FastAPI 多人房间基座；搜索、创作、OAuth 和 Tool Registry 能力仍保留在 FastAPI 后端，但暂未接入地图交互。

## 当前架构

```text
RPGJS Client / CanvasEngine → Tiled 地图、角色渲染、输入与事件
              ↕ standalone bridge
          RPGJS gameplay server（浏览器内）

RPGJS Client ⇄ FastAPI WebSocket → 权威身份、移动限速、房间生命周期

FastAPI REST → Tool Registry → Provider → 知乎开放平台或本地草稿生成
                 ↑
              ToolContext
```

- FastAPI 路由只处理 HTTP 参数、上下文和错误转换。
- Tool Registry 是共享能力入口，同时提供 Agent 可消费的工具 schema。
- `ToolContext` 承载 `user_id`，并为未来 OAuth Token 预留位置；上下文不会进入模型工具参数。
- 热榜、知乎搜索、全网搜索和直答支持 HTTP/MCP Provider；问题推荐固定使用官方 HTTP API。
- 草稿生成使用独立 `DraftProvider`，当前实现为本地模板，未来可替换为外部模型。
- RPGJS gameplay 当前以 standalone 模式运行；客户端另接 FastAPI WebSocket 多人房间基座，并展示失败、断线及指数退避重连状态。
- FastAPI 忽略客户端声明的 avatar ID，服务端生成不可接管的身份；移动距离依据服务端单调时钟并限制单步时间窗。
- 断线或广播失败会移除 avatar 并通知其他连接；空房间在 5 分钟 TTL 后回收。
- CanvasEngine/PixiJS 负责渲染；`@rpgjs/tiledmap` 加载 `frontend/src/tiled/` 中的地图和 tileset。
- `nature-open-world` 是一张 100×100、32px 格子的正交 Tiled 地图；它由四张 50×50 源图合并生成，运行时不发生跨地图房间切换。
- 四个景观区域共用 RPGJS starter 自带的 Pipoya 素材，只保留草地、泥土通路、水域、稀疏树木与石块；区域间保留六格宽的连续通路。
- 输入同时支持 WASD 与方向键移动；页面右下角显示操作提示。
- 登录页复用旧版游客/OAuth 状态逻辑：进入页面时读取 `/api/oauth/status`，游客入口始终可用，只有 `integrationReady` 为真时才启用知乎登录；游客确认后才启动 RPGJS。

## 已有能力

| Tool | REST 入口 | 当前状态 |
| --- | --- | --- |
| `question_recommendations` | `GET /api/zhihu/question-recommendations` | 已接官方 HTTP API |
| `hot_list` | `GET /api/zhihu/hot` | 已接 HTTP/MCP |
| `zhihu_search` | `GET /api/zhihu/search` | 已接 HTTP/MCP |
| `global_search` | `GET /api/zhihu/global-search` | 已接 HTTP/MCP |
| `zhida` | `POST /api/zhihu/answer` | 已接 HTTP/MCP |
| `generate_draft` | `POST /api/avatar/draft` | 本地模板 Provider |

另有 `GET /api/health` 和 `GET /api/me`。启动后可通过 `/docs` 查看 FastAPI 生成的完整接口结构。

## 当前边界

- 当前前端只保留 RPGJS 地图、角色行走、基础碰撞和镜头能力。
- 暂不提供采集、建造、背包、战斗、生存、住宅、搜索或创作界面；RPGJS 自带相关能力不代表本项目已经启用。
- 上一版 React/Phaser 前端已从工作树移除，可从 Git 历史恢复，不再并行维护。
- OAuth 只有安全禁用的接口骨架，没有真实登录或个人数据访问。
- 已有 FastAPI 多人房间、身份、位置消息和连接生命周期基座；RPGJS 角色渲染尚未消费远端位置，也暂不提供聊天或玩家互动。
- 没有 Agent Loop；Registry 只为后续 Agent Runtime 提供基础。
- 没有真实外部模型生成、自动发布、修改或删除。
- Access Secret 仅由后端环境读取，不进入前端、源码、日志或 Tool schema。
- 问题推荐不传主题时使用服务端 Access Secret 所属账号画像，不代表当前 mock 用户。

## 主要代码位置

- `backend/app/main.py`：REST、mock 用户和 OAuth 占位接口。
- `backend/app/zhihu/`：领域模型、Registry、错误及 HTTP/MCP/Draft Provider。
- `backend/tests/`：后端接口、Provider 和 Registry 测试。
- `frontend/src/standalone.ts`：当前 RPGJS standalone 入口。
- `frontend/src/login.ts`、`frontend/src/login.css`：游客入口、OAuth 状态读取和响应式登录页面。
- `frontend/src/world-connection.ts`：多人房间连接、状态提示、重连与换房间。
- `frontend/src/server.ts`：RPGJS gameplay server 与地图 Provider。
- `frontend/src/config/config.client.ts`：客户端、地图 Provider、角色图与键盘映射。
- `frontend/src/modules/main/`：玩家出生和单张运行时地图注册。
- `frontend/src/tiled/`：`nature-open-world.tmx` 连续地图、四张自然区域源图、`nature.world`、tileset 与图形资源。
- `frontend/scripts/build-nature-map.mjs`：将四张 50×50 源图无损合并为 100×100 运行时地图。
- `frontend/public/spritesheets/`：hero 与 female 角色图。

## 验证

```bash
cd backend
.venv/bin/python -m unittest discover -s tests -v

cd ../frontend
npm run build
npm test
```

涉及架构、能力状态或阶段边界的改动，应同步更新本文件。尚未确定的方向保留为讨论事项，不在这里写成既定决策。
