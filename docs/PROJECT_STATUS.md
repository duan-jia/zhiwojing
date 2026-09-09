# 项目现状

## 产品概况

“知乎数字分身”正在先验证地图基础体验。当前可运行前端是一个不依赖后端的 2.5D 开放世界行走 Demo；搜索、创作、OAuth 和 Tool Registry 能力仍保留在后端，但暂未接入这一版前端。

## 当前架构

```text
React HUD ──挂载──→ Phaser 3 Scene → 随机地图、输入、碰撞、摄像机

FastAPI REST → Tool Registry → Provider → 知乎开放平台或本地草稿生成
                 ↑
              ToolContext
```

- FastAPI 路由只处理 HTTP 参数、上下文和错误转换。
- Tool Registry 是共享能力入口，同时提供 Agent 可消费的工具 schema。
- `ToolContext` 承载 `user_id`，并为未来 OAuth Token 预留位置；上下文不会进入模型工具参数。
- 热榜、知乎搜索、全网搜索和直答支持 HTTP/MCP Provider；问题推荐固定使用官方 HTTP API。
- 草稿生成使用独立 `DraftProvider`，当前实现为本地模板，未来可替换为外部模型。
- React 只负责挂载 Phaser 和显示操作提示；`WorldScene` 负责地图绘制、角色输入、碰撞、遮挡和摄像机。
- 地图使用 28×28 菱形格子，启动时随机生成草地、水域、泥地、树木和石头；出生点附近强制保持通行。
- 角色、地块和环境物体使用透明图集，视觉沿用上一版场景的褐绿水彩、墨线和纸张肌理；地图数据、碰撞和深度排序仍与贴图分离。

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

- 当前前端只实现地图随机生成、八方向连续行走、不可通行地块与物体碰撞、基于脚底纵坐标的前后遮挡、平滑跟随和滚轮缩放；视觉层另有地块翻转变化、按相邻格自动计算的水岸与泥地过渡、水面呼吸、物件落地阴影和地图整体投影。
- 暂不提供采集、建造、背包、战斗、生存、建筑互动、住宅、搜索或创作界面。
- 上一版 React 地图和功能界面保存在 `frontend/src/legacy/LegacyApp.tsx`，不从当前入口加载。
- OAuth 只有安全禁用的接口骨架，没有真实登录或个人数据访问。
- 没有多人传输、位置同步、聊天或玩家间互动；住宅的 `ownerId`、`ownerName`、`online` 字段只为后续房间服务预留。
- 没有 Agent Loop；Registry 只为后续 Agent Runtime 提供基础。
- 没有真实外部模型生成、自动发布、修改或删除。
- Access Secret 仅由后端环境读取，不进入前端、源码、日志或 Tool schema。
- 问题推荐不传主题时使用服务端 Access Secret 所属账号画像，不代表当前 mock 用户。

## 主要代码位置

- `backend/app/main.py`：REST、mock 用户和 OAuth 占位接口。
- `backend/app/zhihu/`：领域模型、Registry、错误及 HTTP/MCP/Draft Provider。
- `backend/tests/`：后端接口、Provider 和 Registry 测试。
- `frontend/src/main.tsx`、`frontend/src/MapDemo.tsx`：React 入口和 HUD。
- `frontend/src/game/WorldScene.ts`：Phaser 场景、行走、碰撞、遮挡和摄像机。
- `frontend/src/game/world.ts`：随机地图数据与菱形坐标转换。
- `frontend/src/map-demo.css`：当前地图 Demo 样式。

## 验证

```bash
cd backend
.venv/bin/python -m unittest discover -s tests -v

cd ../frontend
npm run build
```

涉及架构、能力状态或阶段边界的改动，应同步更新本文件。尚未确定的方向保留为讨论事项，不在这里写成既定决策。
