# 知乎数字分身 MVP

“灵魂匹配局：社区 × 社交”是一个把知乎的内容发现、问题讨论与创作表达转化为可探索多人世界的数字分身原型。用户进入知乎主题小镇，在热榜、藏书阁、问道馆、创作坊等地标中发现议题、交流观点，并与具有独立人设和长期记忆的数字分身对话。

本项目同时提供面向初审和产品讨论的[产品说明计划书](docs/PRODUCT_PLAN.md)，以及记录真实实现边界的[项目状态](docs/PROJECT_STATUS.md)。README 侧重快速理解和运行项目；计划书侧重创作思路、知乎生态价值与技术落地方案。

当前 MVP 已接入 RPGJS 多人地图、知乎公共内容 Tool Registry、Agent 对话、人设冷启动与可降级长期记忆。知乎 OAuth 个人数据入口仍按授权状态开放，尚未授权时不会把服务端凭证所属账号冒充为当前玩家。

## 本地运行

完成依赖安装后，推荐在仓库根目录一键启动完整本地链路：

```bash
./scripts/run-local.sh
```

它会构建前端并启动 FastAPI 8000、RPGJS world 8001 和 Vite 5173；任一服务退出时会停止其余进程。没有模型密钥时仍可进入世界，托管角色会显示“本地巡游中”并使用确定性地标巡游。

## 腾讯云一键部署

在 Ubuntu 腾讯云轻量服务器上，从仓库根目录运行：

```bash
sudo bash scripts/deploy-tencent.sh
```

脚本会构建前端（写入 `VITE_API_URL=https://duanzhiwojing.site` 和 `VITE_RPGJS_SERVER_HOST=game.duanzhiwojing.site`）、将静态文件复制到 `/var/www/zhiwojing`、创建 FastAPI/RPGJS 的 systemd 服务、重启服务、生成 Nginx 配置并尝试申请 HTTPS。它默认使用 `duanzhiwojing.site`、`game.duanzhiwojing.site` 和服务器公网 IP `111.230.152.143`，也会交互询问这些值、模型 API Key 及 OAuth 凭证；模型 API Key 为必填项，已保存的值可直接回车复用。模型和 OAuth 凭证只写入服务器 `/etc/zhihu.env`（权限 600），不会写入仓库；运行前请先将两个域名的 DNS A 记录指向服务器公网 IP。当前版本的 OAuth 路由仍是安全占位接口，真实授权流程需在后续版本启用。

也可以分别启动。先启动 FastAPI「大脑」服务（Python 3.11+）：

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

本地测试 Agent 聊天和知乎能力时，先交互式保存模型 API Key 与知乎 Access Secret，再使用统一启动脚本：

```bash
cd backend
./scripts/configure-local-llm.sh
./scripts/run-local.sh
```

两项密钥保存在仓库外的 `~/.config/zhiwojing/secrets.env`，文件权限为 `600`，不会写入仓库、命令参数或日志。需要更换时可直接编辑该文件，保持以下格式（值不要加引号），然后重启后端：

```text
LLM_API_KEY=<模型 API Key>
ZHIHU_ACCESS_SECRET=<知乎开放平台 Access Secret>
```

启动脚本只接受上述两个白名单变量。Agent 默认通过 `https://api.openai-next.com/v1` 调用 `deepseek-v4-flash`；仍可使用进程环境中的 `LLM_BASE_URL` 和 `LLM_MODEL` 覆盖。部署时应改用部署平台的 Secret 管理，不要复制本机密钥文件。

再构建并启动独立的 RPGJS 世界服务（Node 22.12+，建议使用 Node 24）：

```bash
cd frontend
npm ci
npm run build
npm run server
```

另开终端启动 Web 客户端：

```bash
cd frontend
npm run dev
```

打开 http://localhost:5173。客户端默认连接 `localhost:8001`；跨主机部署时通过 `VITE_RPGJS_SERVER_HOST` 指定 RPGJS 地址。登录页可选择并记住体验用户、苏晚或周博三个本地 Mock 身份；该选择仅用于本地 Demo，不是生产认证。进入世界后使用 WASD 或方向键移动，按 B 打开自己的分身，靠近两格内的玩家或居民后按 E（或点击人物）打开对方分身。RPGJS gameplay 在独立 Node 进程中运行，并作为移动、地图与多人同步的唯一世界权威；多个浏览器客户端加入同一 RPGJS 房间后可互见与同步移动。FastAPI 不再承载游戏房间或移动状态，只保留知乎 Tool Registry、REST 能力与 Agent Loop 契约。

## 知乎开放平台配置

知乎能力通过 FastAPI 服务端调用知乎开放平台，前端不会接触 Access Secret。先在知乎开放平台个人中心申请个人 Access Secret；本地开发推荐写入上面的仓库外 `secrets.env` 并通过 `./scripts/run-local.sh` 自动加载。临时运行也可以通过终端环境提供：

```bash
export ZHIHU_ACCESS_SECRET='<your-access-secret>'
uvicorn app.main:app --reload --port 8000
```

不要把 Access Secret 写入源码、项目内 `.env`、日志或前端配置。没有配置时，知乎能力会返回明确的未配置状态，不会伪造结果。

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

## OAuth 授权

配置 OAuth 应用凭证后，登录页会跳转到知乎授权页；回调会校验一次性 state、换取令牌并建立 HttpOnly 会话：

- `GET /api/oauth/status`：检查配置状态并列出五类预留的用户数据能力
- `GET /api/oauth/start`：生成 state 并重定向到知乎授权页
- `GET /auth/callback`：校验 state、换取令牌、读取账号资料并建立会话
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
- `POST /api/agent/chat`：运行分身 Agent Loop；`POST /api/agent/step` 返回分身下一段高层行为意图；`POST /api/agent/init` 仍是 HTTP 501 契约占位接口

问题推荐的 `query` 在 API 层可省略；省略时使用服务端 Access Secret 所属账号画像，而不是当前 mock 用户画像。第一版前端要求填写主题，只调用主题推荐模式。

`idea` 去除首尾空白后至少 3 个字符；`goal` 支持 `知乎回答`（默认）和 `知乎文章`。`tone` 支持 `清晰、真诚、有条理`、`幽默`、`严肃`，未支持的语气会回退到默认模板并在说明中提示。

## 验证

前端：在 `frontend/` 运行 `npm run build` 同时生成 `dist/client` 浏览器产物及 `dist/server` RPGJS Node 世界服务；`npm run server` 启动世界权威。`npm test` 覆盖地图、登录、身份同步、附近目标选择、对话接线和生产预览；Canvas 点击仍需在浏览器中人工走查。

后端：安装依赖后，在 `backend/` 运行 `python -m unittest discover -s tests -v`。测试使用临时 SQLite 数据库，覆盖输入校验、语气和结构、用户初始化及接口错误。
