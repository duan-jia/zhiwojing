# 知乎数字分身 MVP

这是一个围绕“灵魂匹配局：社区 × 社交”的表达型数字分身原型。用户可以在“分身小镇”中移动角色，到创作屋用模板生成草稿、在热榜广场查看讨论，或到探索馆发现问题、使用知乎搜索、全网搜索和知乎直答。当前使用 mock 用户，尚未接入真实登录。

当前架构、能力状态和阶段边界见 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)。

## 本地运行

后端（Python 3.11+）：

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

前端（Node 22.12+，建议使用 Node 24）：

```bash
cd frontend
npm ci
npm run dev
```

打开 http://localhost:5173，使用 WASD 或方向键移动，靠近地点后按 E 互动。当前默认使用 mock 用户；OAuth 后端接口仍为安全禁用的占位，不会发起真实授权或调用用户数据接口。

## 知乎开放平台配置

知乎能力通过 FastAPI 服务端调用知乎开放平台，前端不会接触 Access Secret。先在知乎开放平台个人中心申请个人 Access Secret，再通过启动后端的终端环境提供：

```bash
export ZHIHU_ACCESS_SECRET='<your-access-secret>'
uvicorn app.main:app --reload --port 8000
```

不要把 Access Secret 写入源码、`.env`、日志或前端配置。没有配置时，知乎能力会返回明确的未配置状态，不会伪造结果。

默认使用结构化 HTTP API。四项公共内容能力也可以切换到知乎官方 MCP 服务：

```bash
export ZHIHU_PUBLIC_PROVIDER=mcp
uvicorn app.main:app --reload --port 8000
```

可选值只有 `http` 和 `mcp`，默认为 `http`。两种 Provider 共用领域模型和 Tool Registry，不会在调用失败时自动切换，以免重复消耗额度。官方问题推荐目前独立走 HTTP API；本地草稿生成通过 `DraftProvider` 接入。Registry 暴露以下六个工具，可供后续 Agent Runtime 直接转换为模型工具：

- `question_recommendations`
- `hot_list`
- `zhihu_search`
- `global_search`
- `zhida`
- `generate_draft`

`ToolContext.user_id` 只由宿主传入，不会出现在模型工具参数中；`oauth_token` 仅为后续阶段预留。当前 `generate_draft` 使用本地模板 Provider，未来接外部模型时保持相同输入输出契约即可。

## OAuth 接口预留

首版仅提供安全禁用的接口骨架，便于取得 OAuth 应用凭证后继续接入：

- `GET /api/oauth/status`：检查配置状态并列出五类预留的用户数据能力
- `GET /api/oauth/start`：真实授权尚未启用，返回明确的未配置或未实现错误
- `GET /auth/callback`：预留授权回调，不保存或回显回调参数
- `POST /api/oauth/run-all`：预留创作、关注、收藏夹、收藏内容和近期收藏聚合
- `POST /api/oauth/logout`：幂等退出接口

后续通过部署平台的 Secret/环境变量提供配置，不要创建或提交 `.env`：

```text
ZHIHU_OAUTH_APP_ID=<公开的数字 App ID>
ZHIHU_OAUTH_REDIRECT_URI=https://<公网域名>/auth/callback
ZHIHU_OAUTH_APP_KEY=<OAuth App Key>
ZHIHU_ACCESS_SECRET=<开放平台 Access Secret>
```

App ID、OAuth App Key 和 Access Secret 是三种不同凭证，不能互相替代。App Key 和 Access Secret 不得写入前端、源码、日志或 Git。本地地址只能预览页面；真实知乎登录必须使用与开放平台登记值完全一致的公网 HTTPS 回调地址。

## 接口

- `GET /api/health`：服务健康检查
- `GET /api/me`：当前用户和表达画像
- `GET /api/zhihu/question-recommendations?query=人工智能&count=5`：按主题推荐适合回答的问题
- `GET /api/zhihu/hot?limit=10`：获取 1–30 条真实知乎热榜
- `GET /api/zhihu/search?query=人工智能&count=10`：搜索知乎内容
- `GET /api/zhihu/global-search?query=人工智能&count=10&search_db=all`：搜索全网内容
- `POST /api/zhihu/answer`：调用知乎直答，请求体为 `{"query":"...","model":"zhida-fast-1p5"}`
- `POST /api/avatar/draft`：根据想法生成个人风格草稿，可附带最多 10 条 `references`

问题推荐的 `query` 在 API 层可省略；省略时使用服务端 Access Secret 所属账号画像，而不是当前 mock 用户画像。第一版前端要求填写主题，只调用主题推荐模式。

`idea` 去除首尾空白后至少 3 个字符；`goal` 支持 `知乎回答`（默认）和 `知乎文章`。`tone` 支持 `清晰、真诚、有条理`、`幽默`、`严肃`，未支持的语气会回退到默认模板并在说明中提示。

## 验证

前端：在 `frontend/` 运行 `npm run typecheck` 检查类型；`npm run build` 会先检查类型，再生成生产构建。

后端：安装依赖后，在 `backend/` 运行 `python -m unittest discover -s tests -v`。测试使用临时 SQLite 数据库，覆盖输入校验、语气和结构、用户初始化及接口错误。
