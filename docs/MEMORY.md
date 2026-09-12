# 分身记忆

后端以 Mem0 作为语义记忆层（嵌入式 Qdrant），并以 avatar.db 中的 SQLModel 表保存可审计的结构化状态。

## 作用域与隐私

* `avatar:{id}`：主人的事实、偏好与待办，仅当 `user_id == avatar_id` 时读取。
* `pair:{min}-{max}`：两人的共同历史，ID 始终数值排序；仅这两个身份的对话读取。
* 主人与自己的分身对话读取私有记忆，并按 `relationships.last_met_at` 读取最近不超过 5 位伙伴的共同记忆。与其他分身对话只读取对应 pair。注入 prompt 的内容最多约 1200 字符。
* `/api/agent/step` 只为 nearby 第一个对象读取对应 pair，绝不枚举私有作用域。

这些规则在服务端根据数值 ID 判定；客户端提供的 ID 在生产部署前仍须由认证身份绑定。

## 写入流程

任意访客会话（`user_id != avatar_id`，不依赖 conversation_id 前缀）在每轮回复后用一次 LLM 生成 `summary/topics/mood/familiarity_delta/relation_tag`，以 `infer=False` 写入 pair，并双向更新关系、追加 episode。交流内容哈希作为幂等键。主人对话每累计 6 条消息提取 `facts/prefs/todos`，以 `infer=True` 写入 private，同时更新 profile 与 episode。

## 表结构

* `avatar_profiles`：分身 ID、主人事实 JSON、更新时间。
* `relationships`：有方向的 avatar/partner 行、熟悉度、各自视角 note/tags、最后见面时间；熟悉度双写。
* `episodes`：scope、kind、摘要、conversation、唯一幂等键、metadata 与时间。

## 配置与降级

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MEMORY_ENABLED` | `1` | 设为 `0` 完全关闭，维持原行为 |
| `MEMORY_DATA_DIR` | `./memory_data` | Qdrant、history 与 LangGraph checkpoint 路径 |
| `MEMORY_EMBEDDER` | `fastembed` | `fastembed` 或 `openai` |
| `MEMORY_EMBEDDER_MODEL` | `BAAI/bge-small-zh-v1.5` | 本地 embedding 模型 |

OpenAI embedding 与摘要复用 `LLM_BASE_URL`/`LLM_API_KEY`。任何记忆初始化或运行时读写错误都会记录日志并降级，chat/step 的主要响应不被阻断。LangGraph checkpoint 使用目录内 SQLite，conversation_id 跨重启延续。

Mem0 及本地 embedding 的原生依赖采用惰性导入：即使未安装 `mem0ai`、`fastembed` 或 `onnxruntime`，关闭记忆或初始化失败时 API 仍可启动并维持无长期记忆的原行为。生产安装仍通过 `requirements.txt` 的固定版本获得完整能力。

为保持 LangGraph 0.2 系列兼容性，相关依赖固定为 `langgraph==0.2.60`、`langchain-openai==0.2.14` 与 `langgraph-checkpoint-sqlite==2.0.11`（后者要求 `langgraph-checkpoint>=2.0.21,<3.0.0`）。记忆依赖继续固定为 `mem0ai==2.0.20`、`fastembed==0.8.0`、`onnxruntime==1.30.0`。
