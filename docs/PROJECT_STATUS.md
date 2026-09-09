# 项目现状

## 产品概况

“知乎数字分身”是一个表达型 MVP：用户可以发现问题、搜索资料、查看热榜和直答，再根据自己的想法生成知乎回答或文章草稿。当前使用 mock 用户，不会自动发布内容。

## 当前架构

```text
React 前端 ──REST──┐
                   ├→ Tool Registry → Provider → 知乎开放平台或本地草稿生成
未来 Agent Runtime ┘        ↑
                         ToolContext
```

- FastAPI 路由只处理 HTTP 参数、上下文和错误转换。
- Tool Registry 是共享能力入口，同时提供 Agent 可消费的工具 schema。
- `ToolContext` 承载 `user_id`，并为未来 OAuth Token 预留位置；上下文不会进入模型工具参数。
- 热榜、知乎搜索、全网搜索和直答支持 HTTP/MCP Provider；问题推荐固定使用官方 HTTP API。
- 草稿生成使用独立 `DraftProvider`，当前实现为本地模板，未来可替换为外部模型。

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

- OAuth 只有安全禁用的接口骨架，没有真实登录或个人数据访问。
- 没有 Agent Loop；Registry 只为后续 Agent Runtime 提供基础。
- 没有真实外部模型生成、自动发布、修改或删除。
- Access Secret 仅由后端环境读取，不进入前端、源码、日志或 Tool schema。
- 问题推荐不传主题时使用服务端 Access Secret 所属账号画像，不代表当前 mock 用户。

## 主要代码位置

- `backend/app/main.py`：REST、mock 用户和 OAuth 占位接口。
- `backend/app/zhihu/`：领域模型、Registry、错误及 HTTP/MCP/Draft Provider。
- `backend/tests/`：后端接口、Provider 和 Registry 测试。
- `frontend/src/main.tsx`：前端交互；`frontend/src/style.css`：页面样式。

## 验证

```bash
cd backend
.venv/bin/python -m unittest discover -s tests -v

cd ../frontend
npm run build
```

涉及架构、能力状态或阶段边界的改动，应同步更新本文件。尚未确定的方向保留为讨论事项，不在这里写成既定决策。
