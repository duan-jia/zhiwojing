# 知乎开放平台 API 清单

> 本文依据[知乎开放平台文档](https://developer.zhihu.com/docs)整理，共 23 项 API。各小节标题后的链接可直接打开对应的官方 `key` 文档；实际字段及限额如有变更，以官方文档为准。

## 通用约定与鉴权

除 OAuth 授权页及接口另有说明外，请求使用 HTTPS，并携带：

```http
Authorization: Bearer <access_secret>
X-Request-Timestamp: <秒级 Unix 时间戳>
Content-Type: application/json
X-OAuth-Token: <用户 OAuth access_token，可选>
```

- `X-Request-Timestamp` 与服务端时间的误差不得超过 10 分钟。
- `X-OAuth-Token` 用于需要访问已授权知乎用户数据的接口；仅应用鉴权的接口可不传。
- 下文相对 URL 的服务地址、完整请求示例和最新权限要求见各项官方文档。

### 通用错误码

| 错误码 | 含义 |
| ---: | --- |
| `0` | 成功 |
| `10001` | 参数错误 |
| `20001` | 鉴权失败 |
| `30001` | 频率限制 |
| `30002` | 额度用尽 |
| `30003` | 风险拒绝 |
| `90001` | 内部错误 |

## 内容（6 项）

### 1. 热榜 `hot_list` — **项目已用**

- 官方文档：[hot_list](https://developer.zhihu.com/docs?key=hot_list)
- 请求：`GET /api/v1/content/hot_list`
- 关键参数：`Limit` 可选，最大 30，默认 30。
- 响应要点：`Data` 为 `{Total, Items}`；每个条目含 `Title`、`Url`、`ThumbnailUrl`、`Summary`。

### 2. 知乎搜索 `zhihu_search` — **项目已用**

- 官方文档：[zhihu_search](https://developer.zhihu.com/docs?key=zhihu_search)
- 请求：`GET /api/v1/content/zhihu_search`
- 关键参数：`Query` 必填；`Count` 最大 10、默认 10；`SortBy` 格式为 `字段:方向:(min,max)`，字段支持 `CommentCount`、`VoteUpCount`、`EditTime`。
- 响应要点：返回匹配的知乎内容列表及相关内容信息。

### 3. 全局搜索 `global_search` — **项目已用**

- 官方文档：[global_search](https://developer.zhihu.com/docs?key=global_search)
- 请求：`GET /api/v1/content/global_search`
- 关键参数：`Query` 必填；`Count` 最大 20、默认 10；`Filter` 可选；`SearchDB` 为 `all`、`realtime` 或 `static`。
- 响应要点：返回跨数据源的搜索结果列表。

### 4. 知答对话 `zhida` — **项目已用**

- 官方文档：[zhida](https://developer.zhihu.com/docs?key=zhida)
- 请求：`POST https://developer.zhihu.com/v1/chat/completions`
- 关键参数：JSON body 包含 `model`、`messages`、`stream`；平台提供 3 档模型，模型标识以官方文档为准。
- 响应要点：兼容 Chat Completions 风格；`stream=false` 返回完整回答，`stream=true` 返回流式增量。

### 5. 问题推荐 `question_recommendations` — **项目已用**

- 官方文档：[question_recommendations](https://developer.zhihu.com/docs?key=question_recommendations)
- 请求：`GET /api/v1/user/question_recommendations`
- 关键参数：`Count`；可选 `Query`。
- 响应要点：`Data.Items` 中每项包含 `Title`、`Url`。

### 6. 问题回答 `question_answers` — **知我居备选**

- 官方文档：[question_answers](https://developer.zhihu.com/docs?key=question_answers)
- 请求：`GET /api/v1/content/question_answers`
- 关键参数：`QuestionUrl` 必填；`Offset`；`Limit` 范围 1–50、默认 20。
- 响应要点：返回问题下的回答列表及分页信息。

## 用户数据（5 项）

### 7. 用户内容 `user_contents` — **知我居备选**

- 官方文档：[user_contents](https://developer.zhihu.com/docs?key=user_contents)
- 请求：`GET /api/v1/user/contents`
- 关键参数：`ContentType` 必填，可取 `all`、`answer`、`article`、`zvideo`、`pin`、`question`；`Offset`；`Limit` 最大 50；`SortField` 为 `like_count` 或 `ts`；`SortOrder` 为 `asc` 或 `desc`。
- 响应要点：`Data` 为 `{Items: ContentItem[], Paging}`。

### 8. 用户关注 `user_followees` — **知我居备选**

- 官方文档：[user_followees](https://developer.zhihu.com/docs?key=user_followees)
- 请求：`GET /api/v1/user/followees`
- 关键参数：`Offset`；`Limit` 最大 50。
- 响应要点：返回 `Items: FolloweeItem[]`；条目含 `Fullname`、`UrlToken`、`Url`、`AvatarUrl`。

### 9. 用户收藏内容 `user_collections` — **知我居备选**

- 官方文档：[user_collections](https://developer.zhihu.com/docs?key=user_collections)
- 请求：`GET /api/v1/user/collections`
- 关键参数：`Limit` 默认 20。
- 响应要点：返回 `Items: CollectionContentItem[]`。

### 10. 用户收藏夹 `user_favlists` — **知我居备选**

- 官方文档：[user_favlists](https://developer.zhihu.com/docs?key=user_favlists)
- 请求：`GET /api/v1/user/favlists`
- 关键参数：`Limit` 默认 20。
- 响应要点：返回 `Items: FavlistItem[]`；条目含 `UrlToken`、`Url`、`Title`、`Description`、`IsPublic`。

### 11. 收藏夹内容 `favlist_contents` — **知我居备选**

- 官方文档：[favlist_contents](https://developer.zhihu.com/docs?key=favlist_contents)
- 请求：`GET /api/v1/user/favlist_contents`
- 关键参数：`FavlistUrlToken` 必填；`Offset`；`Limit`。
- 响应要点：返回 `Items: CollectionContentItem[]` 和 `Paging`。

## 创作能力（4 项）

### 12. 用户内容详情 `user_content_detail` — **知我居备选**

- 官方文档：[user_content_detail](https://developer.zhihu.com/docs?key=user_content_detail)
- 请求：`GET /api/v1/user/content_detail`
- 关键参数：`ContentUrl` 必填。
- 响应要点：`Data` 含 `ContentType`、`ContentToken`、`Url`、`Title`、`Body`。

### 13. 用户内容评论 `user_content_comments` — **知我居备选**

- 官方文档：[user_content_comments](https://developer.zhihu.com/docs?key=user_content_comments)
- 请求：`GET /api/v1/user/content_comments`
- 关键参数：`ContentUrl` 必填；`Offset`；`Limit` 范围 1–50、默认 20；`Order` 为 `score`、`reverse` 或 `ascending`。
- 响应要点：返回评论列表及分页信息。

### 14. 创作者帐号统计 `creator_account_stats` — **知我居备选**

- 官方文档：[creator_account_stats](https://developer.zhihu.com/docs?key=creator_account_stats)
- 请求：`GET /api/v1/user/creator_account_stats`
- 关键参数：可选 `ContentType`、`StartDate`、`EndDate`。
- 响应要点：`Data` 含 `Metrics`、`Audience`、`CreationCounts`、`Followers`。

### 15. 创作内容统计 `creator_content_stats` — **知我居备选**

- 官方文档：[creator_content_stats](https://developer.zhihu.com/docs?key=creator_content_stats)
- 请求：`GET /api/v1/user/creator_content_stats`
- 关键参数：`ContentUrl` 必填；可选 `StartDate`、`EndDate`。
- 响应要点：返回指定内容在日期范围内的表现统计指标。

## 知识库（4 项）

> 以下能力当前未使用，均作为 **知我居备选**。

### 16. 知识库列表 `knowledge_bases` — **知我居备选**

- 官方文档：[knowledge_bases](https://developer.zhihu.com/docs?key=knowledge_bases)
- 请求：`GET /api/v1/knowledge/bases`
- 关键参数：`Scope` 为 `all`、`created` 或 `subscribed`。
- 响应要点：返回当前用户可访问的知识库列表。

### 17. 知识库条目 `knowledge_base_items` — **知我居备选**

- 官方文档：[knowledge_base_items](https://developer.zhihu.com/docs?key=knowledge_base_items)
- 请求：`GET /api/v1/knowledge/bases/{KnowledgeBaseID}/items`
- 关键参数：路径参数 `KnowledgeBaseID` 必填；分页参数以官方文档为准。
- 响应要点：返回指定知识库的条目列表及分页信息。

### 18. 知识文件上传 `knowledge_file_upload` — **知我居备选**

- 官方文档：[knowledge_file_upload](https://developer.zhihu.com/docs?key=knowledge_file_upload)
- 请求：`POST /api/v1/knowledge/files`
- 关键参数：使用 `multipart/form-data` 上传文件；文件字段、大小和格式限制以官方文档为准。
- 响应要点：返回上传文件的标识与处理状态，供知识库后续操作使用。

### 19. 知识库检索 `knowledge_search` — **知我居备选**

- 官方文档：[knowledge_search](https://developer.zhihu.com/docs?key=knowledge_search)
- 请求：`POST /api/v1/knowledge/search`
- 关键参数：JSON body 指定查询文本与知识库范围，具体字段以官方文档为准。
- 响应要点：执行 RAG 检索，返回相关知识片段及其来源信息。

## 小工具（2 项）

> 以下能力当前未使用，均作为 **知我居备选**。工具采用异步任务工作流，具体子路径与字段以链接中的官方文档为准。

### 20. PDF 解析 `pdf_parse` — **知我居备选**

- 官方文档：[pdf_parse](https://developer.zhihu.com/docs?key=pdf_parse)
- 请求：`POST https://developer.zhihu.com/resources/v1/files`（上传文件）；`POST https://developer.zhihu.com/api/v1/pdf-parse/tasks`（创建任务）；`GET https://developer.zhihu.com/api/v1/pdf-parse/tasks/{task_id}`（查询任务）。
- 关键参数：上传请求使用 `multipart/form-data`，字段名为 `file`，PDF 大小不超过 100 MB；先上传 PDF 获取 `file_id`，再以 `file_id` 创建解析任务；使用返回的 `task_id` 查询状态。
- 响应要点：任务完成后通过 `result.url` 获取解析结果，即“上传 → `file_id` → 建任务 → 轮询 → `result.url`”。

### 21. PPT 生成 `ppt_generation` — **知我居备选**

- 官方文档：[ppt_generation](https://developer.zhihu.com/docs?key=ppt_generation)
- 请求：`POST https://developer.zhihu.com/api/v1/ppt-generation/tasks`（创建任务）；`GET https://developer.zhihu.com/api/v1/ppt-generation/tasks/{task_id}`（查询任务）。
- 关键参数：创建任务使用 JSON 请求体；`resource_url` 必填；`num_pages` 必填，范围 6–21；保存返回的 `task_id` 并轮询。
- 响应要点：任务完成后返回可下载的 PPTX，即“提交链接 → `task_id` → 轮询 → PPTX”。

## OAuth（1 项）

### 22. 知乎 OAuth 集成 `zhihu_oauth_integrated` — **知我居备选**

- 官方文档：[zhihu_oauth_integrated](https://developer.zhihu.com/docs?key=zhihu_oauth_integrated)
- 授权请求：`GET https://openapi.zhihu.com/authorize?redirect_uri=<redirect_uri>&app_id=<app_id>&response_type=code`。
- 回调参数：用户授权后，回调获得 `authorization_code`（换取令牌时作为 `code`）。
- 换取令牌：`POST https://openapi.zhihu.com/access_token`，参数为 `app_id`、`app_key`、`grant_type=authorization_code`、`redirect_uri`、`code`。
- 响应要点：`{access_token, token_type, expires_in}`；所得令牌可通过通用请求头 `X-OAuth-Token` 传递。
- 前置条件：先申请 `app_id`/`app_key`；申请联系邮箱为 `openplatform@zhihu.com`。

## 额度（1 项）

### 23. 额度查询 `quota` — **知我居备选**

- 官方文档：[quota](https://developer.zhihu.com/docs?key=quota)
- 请求：`GET /api/v1/quota`
- 关键参数：可选 `APIIDs`，用于筛选需查询的接口/能力。
- 响应要点：返回额度使用情况；覆盖 `global_search`、`zhihu_search`、`hot_list`、`question_answers`、`user_data`、`creator`、`zhida_openai`、`knowledge`、`tools` 等能力分组。

