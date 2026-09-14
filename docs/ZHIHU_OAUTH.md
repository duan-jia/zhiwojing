# 知乎 OAuth 2.0

## 流程

1. 浏览器请求 `GET /api/oauth/start`。服务端创建 10 分钟、一次性的 CSRF state，并 302 到知乎授权页。
2. 知乎回调 `GET /auth/callback?authorization_code=...&state=...`。服务端消费 state，以表单 POST 授权码换取约一小时有效的 access token。
3. 服务端创建 60 秒、一次性的 ticket，重定向至 `FRONTEND_URL/auth/callback?ticket=...`。产品会话 token 不出现在 URL。
4. 前端 `POST /api/auth/exchange`，body 为 `{ "ticket": "..." }`，取得 `{token,user}`，后续作为 `Authorization: Bearer <token>`。

state 和 ticket 均不可重放。app key 和 access token 只保留在后端。

## 环境变量

- `ZHIHU_OAUTH_APP_ID`：纯数字应用 ID
- `ZHIHU_OAUTH_APP_KEY`：应用密钥
- `ZHIHU_OAUTH_REDIRECT_URI`：登记的公网 HTTPS 回调，必须以 `/auth/callback` 结尾，例如 `https://duanzhiwojing.site/auth/callback`
- `FRONTEND_URL`：授权结束的前端地址，默认 `http://localhost:5173`
- `ZHIHU_OAUTH_USERINFO_URL`：可选的官方用户信息接口地址
- `ZHIHU_ACCESS_SECRET`：未绑定用户调用用户接口时的兼容回退凭证
- `AUTH_SESSION_DAYS`：产品会话期限，默认 30 天

## 端点

`GET /api/oauth/status` 返回 `configured`、`authorized`、`expiresAt`。`POST /api/oauth/logout` 只撤销并清除知乎授权，不注销产品会话。所有错误包含 `detail.code/message/retryable`。过期的个人凭证返回 `OAUTH_TOKEN_EXPIRED`，客户端应重新发起授权。

用户数据、冷启动和 owner 工具优先使用当前产品用户绑定的 OAuth token；没有绑定时兼容回退 `ZHIHU_ACCESS_SECRET`。

## 身份限制与降级

知乎公开 OAuth 文档没有给出稳定的“获取当前用户”接口。配置 `ZHIHU_OAUTH_USERINFO_URL` 时服务端优先探测并用返回的 `id`/`url_token` 绑定身份。未配置、接口失败或响应缺少身份时，服务端按 token 指纹创建/绑定用户；回调 URL 会标记 `identity_limited=true`。该模式无法跨 token 刷新识别同一个知乎账号，重新授权可能生成另一个产品用户。若 state 绑定已有游客，则原游客会原地升级，避免丢失产品数据。
